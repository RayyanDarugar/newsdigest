import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h2: (props) => (
          <h2
            className="mb-2 mt-6 font-mono text-xs uppercase tracking-[0.15em] text-text-muted first:mt-0"
            {...props}
          />
        ),
        h3: (props) => (
          <h3 className="mb-2 mt-4 font-body font-semibold" {...props} />
        ),
        p: (props) => (
          <p className="mb-3 leading-relaxed text-text" {...props} />
        ),
        ul: (props) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-text" {...props} />
        ),
        ol: (props) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-text" {...props} />
        ),
        a: (props) => (
          <a
            className="text-accent underline underline-offset-2 hover:no-underline"
            target="_blank"
            rel="noreferrer"
            {...props}
          />
        ),
        strong: (props) => <strong className="font-semibold" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
