//go:build js && wasm

// Copyright 2026 Caseflux. SPDX-License-Identifier: Apache-2.0
package main

import (
	"fmt"
	"syscall/js"

	"github.com/caseflux-id/pdf-bundle/internal/bundle"
)

// Set by the build script, so different package versions cannot cross wires.
var bridgeName string

func merge(_ js.Value, args []js.Value) (result any) {
	defer func() {
		if r := recover(); r != nil {
			result = map[string]any{"error": fmt.Sprintf("PDF conversion failed: %v", r)}
		}
	}()
	if len(args) != 1 {
		return map[string]any{"error": "expected document array"}
	}
	values := args[0]
	inputs := make([]bundle.Input, values.Length())
	for i := range inputs {
		value := values.Index(i)
		data := value.Get("data")
		inputs[i] = bundle.Input{MIMEType: value.Get("mimeType").String(), Data: make([]byte, data.Get("byteLength").Int())}
		if js.CopyBytesToGo(inputs[i].Data, data) != len(inputs[i].Data) {
			return map[string]any{"error": "incomplete byte copy"}
		}
	}
	output, err := bundle.Merge(inputs)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	data := js.Global().Get("Uint8Array").New(len(output))
	js.CopyBytesToJS(data, output)
	return map[string]any{"data": data}
}

func main() {
	callback := js.FuncOf(merge)
	js.Global().Set(bridgeName, callback)
	js.Global().Get(bridgeName + "Ready").Invoke()
	select {}
}
