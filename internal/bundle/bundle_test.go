package bundle

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"

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
