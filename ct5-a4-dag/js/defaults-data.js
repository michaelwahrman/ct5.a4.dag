// defaults-data.js -- built-in defaults, embedded as JS (not fetched) so the app
// works when opened directly as a local file:// page with no server and no
// network fetch (browsers block fetch() of local files over file://).
// This file is GENERATED from data/node_types.default.json and
// data/filters.default.json by tools/build-defaults.js -- do not hand-edit it,
// edit those two JSON files and re-run: node tools/build-defaults.js
(function () {
  'use strict';
  window.DAG_DEFAULTS = {
    nodeTypes: [
      {
        "typeId": "color_input",
        "namePrefix": "Color",
        "label": "Color",
        "category": "input",
        "shape": "circle",
        "color": "#3d7fc9",
        "defaultActive": true,
        "inputs": [],
        "outputs": [
          {
            "name": "out",
            "portType": "color",
            "label": "out"
          }
        ],
        "attributes": [
          {
            "name": "color",
            "type": "color4",
            "label": "Color (RGBA)",
            "default": [
              1,
              1,
              1,
              1
            ]
          }
        ],
        "pythonTemplate": "define_color.py --color {attr.color} --note \"constant color value, no working file generated\""
      },
      {
        "typeId": "image_input",
        "namePrefix": "Image",
        "label": "Image",
        "category": "input",
        "shape": "rounded_rect",
        "color": "#3d7fc9",
        "defaultActive": true,
        "inputs": [],
        "outputs": [
          {
            "name": "out",
            "portType": "image",
            "label": "out"
          }
        ],
        "attributes": [
          {
            "name": "filepath",
            "type": "path",
            "label": "Image File",
            "default": ""
          }
        ],
        "pythonTemplate": "load_image.py --in \"{attr.filepath}\" --out \"{out.out}\""
      },
      {
        "typeId": "image_sequence_input",
        "namePrefix": "Sequence",
        "label": "Image Sequence",
        "category": "input",
        "shape": "hexagon",
        "color": "#3d7fc9",
        "defaultActive": true,
        "inputs": [],
        "outputs": [
          {
            "name": "out",
            "portType": "image",
            "label": "out"
          }
        ],
        "attributes": [
          {
            "name": "directory",
            "type": "path",
            "label": "Directory",
            "default": ""
          },
          {
            "name": "baseName",
            "type": "string",
            "label": "Base Filename",
            "default": "shot"
          },
          {
            "name": "padding",
            "type": "int",
            "label": "Frame # Padding",
            "default": 4,
            "min": 1,
            "max": 8
          },
          {
            "name": "suffix",
            "type": "string",
            "label": "Suffix (ext)",
            "default": ".exr"
          }
        ],
        "pythonTemplate": "load_image_sequence.py --in \"{attr.directory}/{attr.baseName}.{frame4}{attr.suffix}\" --frame {frame} --out \"{out.out}\""
      },
      {
        "typeId": "process",
        "namePrefix": "Process",
        "label": "Process (1-in/1-out)",
        "category": "process",
        "shape": "rectangle",
        "color": "#c9963d",
        "defaultActive": true,
        "inputs": [
          {
            "name": "in",
            "portType": "image",
            "label": "in"
          }
        ],
        "outputs": [
          {
            "name": "out",
            "portType": "image",
            "label": "out"
          }
        ],
        "attributes": [
          {
            "name": "operation",
            "type": "enum",
            "label": "Operation",
            "options": [
              "negate",
              "invert",
              "identity",
              "brighten",
              "gamma"
            ],
            "default": "negate"
          },
          {
            "name": "amount",
            "type": "float",
            "label": "Amount",
            "default": 1,
            "min": 0,
            "max": 10
          }
        ],
        "pythonTemplate": "process_image.py --op {attr.operation} --amount {attr.amount} --in \"{in.in}\" --out \"{out.out}\""
      },
      {
        "typeId": "convolution",
        "namePrefix": "Convolve",
        "label": "Convolution",
        "category": "process",
        "shape": "octagon",
        "color": "#c9963d",
        "defaultActive": true,
        "inputs": [
          {
            "name": "in",
            "portType": "image",
            "label": "in"
          }
        ],
        "outputs": [
          {
            "name": "out",
            "portType": "image",
            "label": "out"
          }
        ],
        "attributes": [
          {
            "name": "filterType",
            "type": "filterRef",
            "label": "Filter",
            "default": "identity"
          }
        ],
        "pythonTemplate": "convolve_image.py --in \"{in.in}\" --filter {attr.filterType} --out \"{out.out}\""
      },
      {
        "typeId": "split_channels",
        "namePrefix": "Split",
        "label": "Split RGBA",
        "category": "process",
        "shape": "triangle",
        "color": "#c9963d",
        "defaultActive": true,
        "inputs": [
          {
            "name": "in",
            "portType": "image_or_color",
            "label": "in"
          }
        ],
        "outputs": [
          {
            "name": "r",
            "portType": "channel",
            "label": "r"
          },
          {
            "name": "g",
            "portType": "channel",
            "label": "g"
          },
          {
            "name": "b",
            "portType": "channel",
            "label": "b"
          },
          {
            "name": "a",
            "portType": "channel",
            "label": "a"
          }
        ],
        "attributes": [],
        "pythonTemplate": "split_channels.py --in \"{in.in}\" --out-r \"{out.r}\" --out-g \"{out.g}\" --out-b \"{out.b}\" --out-a \"{out.a}\""
      },
      {
        "typeId": "assemble_channels",
        "namePrefix": "Assemble",
        "label": "Assemble RGBA",
        "category": "process",
        "shape": "pentagon",
        "color": "#c9963d",
        "defaultActive": true,
        "inputs": [
          {
            "name": "r",
            "portType": "channel",
            "label": "r"
          },
          {
            "name": "g",
            "portType": "channel",
            "label": "g"
          },
          {
            "name": "b",
            "portType": "channel",
            "label": "b"
          },
          {
            "name": "a",
            "portType": "channel",
            "label": "a"
          }
        ],
        "outputs": [
          {
            "name": "out",
            "portType": "image",
            "label": "out"
          }
        ],
        "attributes": [],
        "pythonTemplate": "assemble_channels.py --r \"{in.r}\" --g \"{in.g}\" --b \"{in.b}\" --a \"{in.a}\" --out \"{out.out}\""
      },
      {
        "typeId": "composite",
        "namePrefix": "Composite",
        "label": "Composite",
        "category": "process",
        "shape": "diamond",
        "color": "#c9963d",
        "defaultActive": true,
        "inputs": [
          {
            "name": "a",
            "portType": "image",
            "label": "A"
          },
          {
            "name": "b",
            "portType": "image",
            "label": "B"
          }
        ],
        "outputs": [
          {
            "name": "out",
            "portType": "image",
            "label": "out"
          }
        ],
        "attributes": [
          {
            "name": "mode",
            "type": "enum",
            "label": "Mode",
            "options": [
              "over",
              "add",
              "multiply",
              "screen",
              "difference"
            ],
            "default": "over"
          },
          {
            "name": "mix",
            "type": "float",
            "label": "Mix",
            "default": 1,
            "min": 0,
            "max": 1
          }
        ],
        "pythonTemplate": "composite_images.py --a \"{in.a}\" --b \"{in.b}\" --mode {attr.mode} --mix {attr.mix} --out \"{out.out}\""
      },
      {
        "typeId": "write_output",
        "namePrefix": "Output",
        "label": "Write Output",
        "category": "output",
        "shape": "rounded_rect",
        "color": "#5fae5f",
        "defaultActive": true,
        "inputs": [
          {
            "name": "in",
            "portType": "image",
            "label": "in"
          }
        ],
        "outputs": [],
        "attributes": [
          {
            "name": "directory",
            "type": "path",
            "label": "Output Directory",
            "default": ""
          },
          {
            "name": "baseName",
            "type": "string",
            "label": "Base Filename",
            "default": "output"
          },
          {
            "name": "suffix",
            "type": "string",
            "label": "Suffix (ext)",
            "default": ".exr"
          }
        ],
        "pythonTemplate": "write_image.py --in \"{in.in}\" --out \"{attr.directory}/{attr.baseName}.{frame4}{attr.suffix}\""
      }
    ],
    filters: [
      {
        "name": "identity",
        "label": "Identity (no change)",
        "rows": 3,
        "cols": 3,
        "normalize": false,
        "kernel": [
          [
            0,
            0,
            0
          ],
          [
            0,
            1,
            0
          ],
          [
            0,
            0,
            0
          ]
        ]
      },
      {
        "name": "blur",
        "label": "Box Blur 5x5",
        "rows": 5,
        "cols": 5,
        "normalize": true,
        "kernel": [
          [
            1,
            1,
            1,
            1,
            1
          ],
          [
            1,
            1,
            1,
            1,
            1
          ],
          [
            1,
            1,
            1,
            1,
            1
          ],
          [
            1,
            1,
            1,
            1,
            1
          ],
          [
            1,
            1,
            1,
            1,
            1
          ]
        ]
      },
      {
        "name": "gaussian_blur",
        "label": "Gaussian Blur 5x5",
        "rows": 5,
        "cols": 5,
        "normalize": true,
        "kernel": [
          [
            1,
            4,
            6,
            4,
            1
          ],
          [
            4,
            16,
            24,
            16,
            4
          ],
          [
            6,
            24,
            36,
            24,
            6
          ],
          [
            4,
            16,
            24,
            16,
            4
          ],
          [
            1,
            4,
            6,
            4,
            1
          ]
        ]
      },
      {
        "name": "sharpen",
        "label": "Sharpen 3x3",
        "rows": 3,
        "cols": 3,
        "normalize": false,
        "kernel": [
          [
            0,
            -1,
            0
          ],
          [
            -1,
            5,
            -1
          ],
          [
            0,
            -1,
            0
          ]
        ]
      },
      {
        "name": "edge_detect",
        "label": "Edge Detect 3x3",
        "rows": 3,
        "cols": 3,
        "normalize": false,
        "kernel": [
          [
            -1,
            -1,
            -1
          ],
          [
            -1,
            8,
            -1
          ],
          [
            -1,
            -1,
            -1
          ]
        ]
      }
    ]
  };
})();
