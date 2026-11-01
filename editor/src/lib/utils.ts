import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Custom font sizes from tailwind.config.js. Without this twMerge reads `text-ed-body` as a text
// colour and drops it whenever a colour such as `text-red-400` is added, so the item grows to the
// inherited size.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["ed-label", "ed-body", "ed-title"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
