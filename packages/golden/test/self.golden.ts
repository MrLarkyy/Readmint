import { defineGoldenSuite } from "../src/index.js";

const open = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">';

export default defineGoldenSuite<string>({
  name: "self",
  render: (svg) => svg,
  fixtures: [
    {
      name: "rect-solid",
      input: `${open}<rect x="4" y="4" width="56" height="24" fill="#2ea043"/></svg>`,
    },
    {
      name: "circle-gradient",
      input:
        `${open}<defs><linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">` +
        '<stop offset="0" stop-color="#58a6ff"/><stop offset="1" stop-color="#bc8cff"/></linearGradient></defs>' +
        '<circle cx="32" cy="16" r="13" fill="url(#fade)"/></svg>',
    },
    {
      name: "path-fractional",
      input:
        `${open}<path d="M4.12345 28.5 L32.5 3.25 L60.000001 28.5 Z" fill="none" stroke="#f78166" stroke-width="2.5" ` +
        'stroke-linejoin="round"/></svg>',
    },
    {
      name: "group-transform-opacity",
      scale: 2,
      input:
        `${open}<g transform="translate(32 16) rotate(20)" opacity="0.5"><rect x="-20" y="-8" width="40" height="16" ` +
        'fill="#d29922"/></g><rect x="2" y="2" width="12" height="12" fill="#f85149" opacity="0.8"/></svg>',
    },
  ],
});
