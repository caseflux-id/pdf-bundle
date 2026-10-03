package bundle

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/carlos7ags/folio/document"
	"github.com/carlos7ags/folio/reader"
)

func TestMixedOrder(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 10, 20))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var pngBytes, jpegBytes bytes.Buffer
	if err := png.Encode(&pngBytes, img); err != nil {
		t.Fatal(err)
	}
	if err := jpeg.Encode(&jpegBytes, img, nil); err != nil {
		t.Fatal(err)
	}
	existing, err := Merge([]Input{{MIMEType: "text/html", Data: []byte("<p>Existing PDF</p>")}})
	if err != nil {
		t.Fatal(err)
	}
	result, err := Merge([]Input{
		{MIMEType: "text/html", Data: []byte("<style>@page { size: 300pt 400pt }</style><p>First</p>")},
		{MIMEType: "image/png", Data: pngBytes.Bytes()},
		{MIMEType: "image/jpeg", Data: jpegBytes.Bytes()},
		{MIMEType: "application/pdf", Data: existing},
	})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := reader.Parse(result)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.PageCount() != 4 {
		t.Fatalf("got %d pages", parsed.PageCount())
	}
	first, err := parsed.Page(0)
	if err != nil {
		t.Fatal(err)
	}
	if first.Width != 300 || first.Height != 400 {
		t.Fatalf("first page lost geometry: %v", first)
	}
	second, err := parsed.Page(1)
	if err != nil {
		t.Fatal(err)
	}
	if second.Width < 590 || second.Height < 840 {
		t.Fatal("image is not on A4")
	}
}

func parseSingle(t *testing.T, data []byte) *reader.PdfReader {
	t.Helper()
	parsed, err := reader.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

var cmRe = regexp.MustCompile(`(-?[0-9.]+) (-?[0-9.]+) (-?[0-9.]+) (-?[0-9.]+) (-?[0-9.]+) (-?[0-9.]+) cm`)

// lastCM returns the scale and translation of the final cm operator on page 0
// of data. Folio emits existing-page and image placement as a single cm.
func lastCM(t *testing.T, data []byte) (sx, sy, tx, ty float64) {
	t.Helper()
	imp, err := reader.ExtractPageImport(parseSingle(t, data), 0)
	if err != nil {
		t.Fatal(err)
	}
	matches := cmRe.FindAllSubmatch(imp.ContentStream, -1)
	if len(matches) == 0 {
		t.Fatalf("no cm operator in page content: %q", imp.ContentStream)
	}
	last := matches[len(matches)-1]
	parse := func(i int) float64 {
		f, err := strconv.ParseFloat(string(last[i]), 64)
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	// ConcatMatrix emits "a b c d e f cm" = "width 0 0 height x y cm".
	return parse(1), parse(4), parse(5), parse(6)
}

func TestFitPlacement(t *testing.T) {
	size := document.PageSizeA4
	contain := fitPlacement(10, 20, size, "contain")
	cover := fitPlacement(10, 20, size, "cover")
	if contain.X < 0 || contain.Y < 0 || contain.Width > size.Width+0.01 || contain.Height > size.Height+0.01 {
		t.Fatalf("contain must fit inside the page: %+v", contain)
	}
	if !near(contain.Y, 0) || contain.X <= 0 {
		t.Fatalf("contain of a taller-than-page source fills height and centers horizontally: %+v", contain)
	}
	if cover.Width < size.Width-0.01 || cover.Height < size.Height-0.01 {
		t.Fatalf("cover must cover the page: %+v", cover)
	}
	if cover.Y > -0.01 {
		t.Fatalf("cover overflow must be clipped via negative y: %+v", cover)
	}
	if cover.Width*cover.Height <= contain.Width*contain.Height {
		t.Fatalf("cover scale must exceed contain scale")
	}
}

func TestHTMLGeometryDimensions(t *testing.T) {
	cases := []struct {
		page, orientation string
		width, height     float64
	}{
		{"a4", "portrait", 595.28, 841.89},
		{"a4", "landscape", 841.89, 595.28},
		{"letter", "portrait", 612, 792},
		{"letter", "landscape", 792, 612},
		{"legal", "portrait", 612, 1008},
		{"legal", "landscape", 1008, 612},
	}
	for _, tc := range cases {
		result, err := Merge([]Input{{MIMEType: "text/html", Data: []byte("<p>Hello</p>"),
			Geometry: &Geometry{Page: tc.page, Orientation: tc.orientation}}})
		if err != nil {
			t.Fatalf("%s %s: %v", tc.page, tc.orientation, err)
		}
		page, err := parseSingle(t, result).Page(0)
		if err != nil {
			t.Fatal(err)
		}
		if page.Width != tc.width || page.Height != tc.height {
			t.Errorf("%s %s: got %vx%v, want %vx%v", tc.page, tc.orientation, page.Width, page.Height, tc.width, tc.height)
		}
	}
}

func TestHTMLGeometryOverridesBasePage(t *testing.T) {
	result, err := Merge([]Input{{MIMEType: "text/html",
		Data:     []byte("<style>@page { size: A4; margin: 2cm; }</style><p>Hello</p>"),
		Geometry: &Geometry{Page: "letter", Orientation: "landscape"}}})
	if err != nil {
		t.Fatal(err)
	}
	page, err := parseSingle(t, result).Page(0)
	if err != nil {
		t.Fatal(err)
	}
	if page.Width != 792 || page.Height != 612 {
		t.Fatalf("got %vx%v, want 792x612", page.Width, page.Height)
	}
}

func TestImageGeometryContainCover(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 10, 20))
	var pngBytes bytes.Buffer
	if err := png.Encode(&pngBytes, img); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		page, orientation, fit string
		width, height          float64
	}{
		{"a4", "portrait", "contain", 595.28, 841.89},
		{"a4", "landscape", "cover", 841.89, 595.28},
		{"letter", "portrait", "cover", 612, 792},
	}
	for _, tc := range cases {
		result, err := Merge([]Input{{MIMEType: "image/png", Data: pngBytes.Bytes(),
			Geometry: &Geometry{Page: tc.page, Orientation: tc.orientation, Fit: tc.fit}}})
		if err != nil {
			t.Fatal(err)
		}
		page, err := parseSingle(t, result).Page(0)
		if err != nil {
			t.Fatal(err)
		}
		if page.Width != tc.width || page.Height != tc.height {
			t.Errorf("%s %s %s: got %vx%v, want %vx%v", tc.page, tc.orientation, tc.fit, page.Width, page.Height, tc.width, tc.height)
		}
		// The emitted matrix must match the computed placement, including the
		// negative offset that pushes cover overflow outside the page box.
		size, err := pageSize(tc.page, tc.orientation)
		if err != nil {
			t.Fatal(err)
		}
		want := fitPlacement(10, 20, size, tc.fit)
		sx, sy, tx, ty := lastCM(t, result)
		if !near(sx, want.Width) || !near(sy, want.Height) || !near(tx, want.X) || !near(ty, want.Y) {
			t.Errorf("%s %s %s: cm=%v,%v,%v,%v want %v,%v,%v,%v", tc.page, tc.orientation, tc.fit,
				sx, sy, tx, ty, want.Width, want.Height, want.X, want.Y)
		}
		if tc.fit == "cover" && tx >= 0 && ty >= 0 {
			t.Errorf("%s %s cover: expected a negative clip offset, got x=%v y=%v", tc.page, tc.orientation, tx, ty)
		}
	}
}

func near(a, b float64) bool {
	return math.Abs(a-b) < 0.01
}

func TestPDFGeometryRelayout(t *testing.T) {
	source, err := Merge([]Input{{MIMEType: "text/html", Data: []byte("<style>@page { size: 300pt 400pt }</style><p>Source</p>")}})
	if err != nil {
		t.Fatal(err)
	}
	for _, fit := range []string{"contain", "cover"} {
		result, err := Merge([]Input{{MIMEType: "application/pdf", Data: source,
			Geometry: &Geometry{Page: "letter", Orientation: "landscape", Fit: fit}}})
		if err != nil {
			t.Fatalf("%s: %v", fit, err)
		}
		parsed := parseSingle(t, result)
		if parsed.PageCount() != 1 {
			t.Fatalf("%s: got %d pages", fit, parsed.PageCount())
		}
		page, err := parsed.Page(0)
		if err != nil {
			t.Fatal(err)
		}
		if page.Width != 792 || page.Height != 612 {
			t.Fatalf("%s: got %vx%v, want 792x612", fit, page.Width, page.Height)
		}
		if !bytes.Contains(result, []byte("/Subtype /Form")) || !bytes.Contains(result, []byte("/FormType")) {
			t.Fatalf("%s: source page was not embedded as a Form XObject", fit)
		}
		// ImportPageWithOpts emits ScaleX/ScaleY directly (unlike AddImage,
		// which emits width/height), followed by the centered translation.
		want := fitPlacement(300, 400, document.PageSizeLetter.Landscape(), fit)
		sx, sy, tx, ty := lastCM(t, result)
		if !near(sx, want.Width/300) || !near(sy, want.Height/400) || !near(tx, want.X) || !near(ty, want.Y) {
			t.Errorf("%s: cm=%v,%v,%v,%v want %v,%v,%v,%v", fit,
				sx, sy, tx, ty, want.Width/300, want.Height/400, want.X, want.Y)
		}
		if fit == "cover" && tx >= 0 && ty >= 0 {
			t.Errorf("cover: expected a negative clip offset, got x=%v y=%v", tx, ty)
		}
	}
}

func TestNoGeometryPreservesBehavior(t *testing.T) {
	html, err := Merge([]Input{{MIMEType: "text/html", Data: []byte("<p>Hello</p>")}})
	if err != nil {
		t.Fatal(err)
	}
	if page, _ := parseSingle(t, html).Page(0); page.Width < 595 || page.Width > 596 {
		t.Fatalf("HTML default lost A4: %v", page.Width)
	}
	pdf, err := convert(Input{MIMEType: "application/pdf", Data: html})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(pdf, html) {
		t.Fatal("PDF without geometry must pass through unchanged")
	}
}

func TestInvalidInputs(t *testing.T) {
	cases := [][]Input{
		nil,
		{{MIMEType: "application/pdf", Data: []byte("broken")}},
		{{MIMEType: "image/png", Data: []byte("broken")}},
		{{MIMEType: "image/webp", Data: []byte("x")}},
		{{MIMEType: "text/html", Data: []byte{255}}},
	}
	for _, inputs := range cases {
		if _, err := Merge(inputs); err == nil {
			t.Errorf("expected failure: %+v", inputs)
		}
	}
	_, err := Merge([]Input{{MIMEType: "text/html", Data: []byte(`<img src="https://example.com/image.png">`)}})
	if err == nil || !strings.Contains(err.Error(), "document 0") {
		t.Fatalf("expected indexed asset failure, got %v", err)
	}
}
