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

type Input struct {
	MIMEType string
	Data     []byte
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
		return input.Data, nil
	}
	doc := document.NewDocument(document.PageSizeA4)
	switch input.MIMEType {
	case "text/html":
		if !utf8.Valid(input.Data) {
			return nil, fmt.Errorf("HTML must be UTF-8")
		}
		err := doc.AddHTML(string(input.Data), &foliohtml.Options{
			PageWidth: document.PageSizeA4.Width, PageHeight: document.PageSizeA4.Height,
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
		// Fit and center on one A4 page, preserving the image aspect ratio.
		doc.SetMargins(layout.Margins{})
		pw, ph := document.PageSizeA4.Width, document.PageSizeA4.Height
		scale := math.Min(pw/float64(img.Width()), ph/float64(img.Height()))
		w, h := float64(img.Width())*scale, float64(img.Height())*scale
		doc.AddPage().AddImage(img, (pw-w)/2, (ph-h)/2, w, h)
	default:
		return nil, fmt.Errorf("unsupported MIME type %q", input.MIMEType)
	}
	var output bytes.Buffer
	if _, err := doc.WriteTo(&output); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
