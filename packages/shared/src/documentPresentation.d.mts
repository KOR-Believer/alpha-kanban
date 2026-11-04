export function documentPresentation(markdown: string): {
  markdown: string;
  fields: Array<{ name: "Owner" | "Document-ID"; value: string; line: number }>;
};
