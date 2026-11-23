// The text and layout of a post image. Shared by the browser (editor) and the server (renderer).
export type ImageLayout = "compare" | "steps" | "list" | "quote";

export type ImageSpec = {
  layout: ImageLayout;
  kicker: string; // small all-caps line above the title
  title: string;
  bad: { heading: string; points: string[] }; // compare: the wrong way
  good: { heading: string; points: string[] }; // compare: the right way
  items: string[]; // steps / list
  quote: string; // quote
  callout: { label: string; text: string }; // optional box at the bottom (empty text = none)
  footer: string; // small line at the very bottom, e.g. your name
  alt: string; // alt text for screen readers
};

export const LAYOUTS: { id: ImageLayout; label: string; hint: string }[] = [
  { id: "compare", label: "Wrong vs right", hint: "Two panels: what goes wrong, what to do instead" },
  { id: "steps", label: "Steps", hint: "A numbered process, 3-5 steps" },
  { id: "list", label: "Key points", hint: "3-5 short takeaways" },
  { id: "quote", label: "Big line", hint: "One strong sentence from the post" },
];

export const emptySpec = (): ImageSpec => ({
  layout: "list",
  kicker: "",
  title: "",
  bad: { heading: "", points: [] },
  good: { heading: "", points: [] },
  items: [],
  quote: "",
  callout: { label: "", text: "" },
  footer: "",
  alt: "",
});
