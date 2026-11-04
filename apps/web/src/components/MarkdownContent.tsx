import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Shared GFM and typography; each reader supplies only its link/heading context. */
export function MarkdownContent({ remarkPlugins = [], ...props }: Options) {
  return <div className="ak-markdown"><ReactMarkdown {...props} remarkPlugins={[remarkGfm, ...(remarkPlugins ?? [])]} /></div>;
}
