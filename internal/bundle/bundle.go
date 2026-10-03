// Copyright 2026 Caseflux. SPDX-License-Identifier: Apache-2.0
package bundle

import (
	"bytes"
	"fmt"
	"math"
	"unicode/utf8"

	"github.com/carlos7ags/folio/document"
	foliohtml "github.com/carlos7ags/folio/html"
	folioimage "github.com/carlos7ags/folio/image"
	"github.com/carlos7ags/folio/layout"
	"github.com/carlos7ags/folio/reader"
)

type Geometry struct {
	Page        string
	Orientation string
	Fit         string
}

type Input struct {
	MIMEType string
	Data     []byte
	Geometry *Geometry
}

func pageSize(page, orientation string) (document.PageSize, error) {
	var size document.PageSize
	switch page {
	case "a4":
		size = document.PageSizeA4
	case "letter":
		size = document.PageSizeLetter
	case "legal":
		size = document.PageSizeLegal
	default:
		return document.PageSize{}, fmt.Errorf("unsupported page %q", page)
	}
	if orientation == "landscape" {
		size = size.Landscape()
	}
	return size, nil
}

// Merge converts each input and concatenates its pages in array order.
func Merge(inputs []Input) ([]byte, error) {
	if len(inputs) == 0 {
		return nil, fmt.Errorf("expected at least one document")
	}
	readers := make([]*reader.PdfReader, 0, len(inputs))
	for i, input := range inputs {
		data, err := convert(input)
		if err != nil {
			return nil, fmt.Errorf("document %d: %w", i, err)
		}
		parsed, err := reader.Parse(data)
		if err != nil {
			return nil, fmt.Errorf("document %d: %w", i, err)
		}
		if parsed.PageCount() == 0 {
			return nil, fmt.Errorf("document %d: no pages", i)
		}
		readers = append(readers, parsed)
	}
	merged, err := reader.Merge(readers...)
	if err != nil {
		return nil, err
	}
	var output bytes.Buffer
	if _, err := merged.WriteTo(&output); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func convert(input Input) ([]byte, error) {
	if len(input.Data) == 0 {
		return nil, fmt.Errorf("empty data")
	}
	if input.MIMEType == "application/pdf" {
		if input.Geometry == nil {
			return input.Data, nil
		}
		return relayoutPDF(input.Data, *input.Geometry)
	}
	var size document.PageSize
	if input.Geometry != nil {
		var err error
		if size, err = pageSize(input.Geometry.Page, input.Geometry.Orientation); err != nil {
			return nil, err
		}
	} else {
		size = document.PageSizeA4
	}
	doc := document.NewDocument(size)
	switch input.MIMEType {
	case "text/html":
		if !utf8.Valid(input.Data) {
			return nil, fmt.Errorf("HTML must be UTF-8")
		}
		html := string(input.Data)
		if input.Geometry != nil {
			html += "<style>@page { size: " + cssPageName(input.Geometry.Page) + " " + input.Geometry.Orientation + "; }</style>"
		}
		err := doc.AddHTML(html, &foliohtml.Options{
			PageWidth: size.Width, PageHeight: size.Height,
			StrictAssets: true, MaxElements: 100000, MaxDepth: 256,
		})
		if err != nil {
			return nil, err
		}
	case "image/png", "image/jpeg":
		var img *folioimage.Image
		var err error
		if input.MIMEType == "image/png" {
			img, err = folioimage.NewPNG(input.Data)
		} else {
			img, err = folioimage.NewJPEG(input.Data)
		}
		if err != nil {
			return nil, err
		}
		doc.SetMargins(layout.Margins{})
		fit := "contain"
		if input.Geometry != nil {
			fit = input.Geometry.Fit
		}
		drawImage(doc.AddPage(), img, size, fit)
	default:
		return nil, fmt.Errorf("unsupported MIME type %q", input.MIMEType)
	}
	var output bytes.Buffer
	if _, err := doc.WriteTo(&output); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func cssPageName(page string) string {
	switch page {
	case "letter":
		return "Letter"
	case "legal":
		return "Legal"
	default:
		return "A4"
	}
}

// placement holds the center-aligned draw box for a source of srcW x srcH on a
// target page of size. For cover, w/h exceed size and x/y are negative so the
// target page box clips the overflow.
type placement struct {
	X, Y, Width, Height float64
}

func fitPlacement(srcW, srcH float64, size document.PageSize, fit string) placement {
	scale := math.Min(size.Width/srcW, size.Height/srcH)
	if fit == "cover" {
		scale = math.Max(size.Width/srcW, size.Height/srcH)
	}
	w, h := srcW*scale, srcH*scale
	return placement{X: (size.Width - w) / 2, Y: (size.Height - h) / 2, Width: w, Height: h}
}

// drawImage places img on page, centered, scaled to contain or cover size.
func drawImage(page *document.Page, img *folioimage.Image, size document.PageSize, fit string) {
	p := fitPlacement(float64(img.Width()), float64(img.Height()), size, fit)
	page.AddImage(img, p.X, p.Y, p.Width, p.Height)
}

// relayoutPDF places each source page onto a target page, preserving
// vector content by embedding it as a Form XObject (no rasterization).
func relayoutPDF(data []byte, geometry Geometry) ([]byte, error) {
	size, err := pageSize(geometry.Page, geometry.Orientation)
	if err != nil {
		return nil, err
	}
	source, err := reader.Parse(data)
	if err != nil {
		return nil, err
	}
	if source.PageCount() == 0 {
		return nil, fmt.Errorf("no pages")
	}
	doc := document.NewDocument(size)
	for i := 0; i < source.PageCount(); i++ {
		imp, err := reader.ExtractPageImport(source, i)
		if err != nil {
			return nil, err
		}
		p := fitPlacement(imp.Width, imp.Height, size, geometry.Fit)
		page := doc.AddPage()
		page.ImportPageWithOpts(imp.ContentStream, imp.Resources, imp.Width, imp.Height, &document.ImportPageOpts{
			X: p.X, Y: p.Y, ScaleX: p.Width / imp.Width, ScaleY: p.Height / imp.Height,
		})
	}
	var output bytes.Buffer
	if _, err := doc.WriteTo(&output); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
