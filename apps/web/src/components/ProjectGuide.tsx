import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Check, Copy } from "lucide-react";
import { useTranslation } from "../i18n";
import { SkillInstallPanel } from "./SkillGuide";
import { Button, buttonVariants } from "./ui/button";

type GuideStep = {
  title: string;
  description: string;
  prompt?: string;
  review?: string[];
  replies?: Array<[string, string]>;
};

const steps: GuideStep[] = [
  {
    title: "Explore the idea together",
    description: "Start in your AI chat, before writing documents or code. Go back and forth about who will use the app, which features matter, and what can wait.",
    prompt: "I want to build a reading journal app. Let's brainstorm features in discussion mode. Ask me questions and help me explore the idea; don't write documents or code yet.",
    replies: [
      ["AI", "Will you use it alone, or share your reading with others?"],
      ["You", "Just me for now. I want to record books and notes. Sharing can wait."],
    ],
  },
  {
    title: "Ask for a plan and ticket draft",
    description: "Once the direction takes shape, turn the conversation into a draft. It is fine to leave undecided details as open questions at this point.",
    prompt: "Use $implementation-ledger to draft a plan and tickets based on our conversation so far. Separate agreed requirements from open questions. Write the documents, but don't start implementation yet.",
  },
  {
    title: "Read the draft yourself",
    description: "Read the plan and ticket details, not just the AI's summary. Correct anything that differs from what you meant before moving on.",
    review: [
      "Does the first version include the features you actually want?",
      "Are features you postponed still outside this implementation?",
      "Can you tell what each ticket will change and how completion will be checked?",
    ],
  },
  {
    title: "Talk through the open questions",
    description: "Return to the AI chat for questions that affect this implementation. Discuss, answer, and review again until those decisions are clear. Questions about later work can stay open.",
    prompt: "Let's go through the open questions that affect this implementation, one at a time. Explain what each answer would change, then ask me. Keep later-work questions separate and don't start coding yet.",
  },
  {
    title: "Update the tickets with your decisions",
    description: "When the relevant questions are settled, ask the AI to reflect the answers in the documents. Resolving a question means updating the scope and completion criteria, not simply deleting it.",
    prompt: "Update the plan and existing tickets with the decisions we just made. Reflect them in the scope and completion criteria, and remove resolved questions from the pending list. Keep any later-work questions. Don't implement yet.",
  },
  {
    title: "Review the final documents",
    description: "Read the updated documents once more. If something is still unclear, return to the discussion and update them again. Start development when the agreed work looks right to you.",
    review: [
      "Are your answers reflected in the actual plan and tickets?",
      "Are the decisions needed for this implementation settled?",
      "Do the ticket order, scope, and completion criteria match your expectations?",
    ],
  },
  {
    title: "Ask for implementation in order",
    description: "Now give an explicit implementation request. Review the results and tests as tickets finish; use the board to follow progress when helpful.",
    prompt: "I've reviewed the updated plan and tickets. Implement the tickets in order, respecting their dependencies. Check each ticket's completion criteria, record the results, and continue to the next. Ask before the affected work if a new decision changes this implementation's scope.",
  },
];

function ExampleRequest({ prompt, title }: { prompt: string; title: string }) {
  const { t } = useTranslation();
  const text = t(prompt);
  const quote = useRef<HTMLQuoteElement>(null);
  const [result, setResult] = useState<{ text: string; failed: boolean } | null>(null);
  const currentResult = result?.text === text ? result : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setResult({ text, failed: false });
    } catch {
      if (quote.current) {
        quote.current.focus();
        const range = document.createRange();
        range.selectNodeContents(quote.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setResult({ text, failed: true });
    }
  }

  return <div className="ak-guide-request">
    <div className="ak-guide-request-heading">
      <span>{t("Example request to your AI")}</span>
      <span role="status">{currentResult ? t(currentResult.failed ? "Text selected. Copy it manually." : "Request copied") : ""}</span>
      <Button size="iconSm" variant="ghost" aria-label={t("Copy example request: {{step}}", { step: t(title) })} title={t("Copy request")} onClick={() => void copy()}>
        {currentResult && !currentResult.failed ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
    </div>
    <blockquote ref={quote} tabIndex={-1} className="ak-focus-ring">{text}</blockquote>
  </div>;
}

export function ProjectGuide() {
  const { t } = useTranslation();
  return <section className="ak-project-guide" aria-labelledby="project-guide-title">
    <header className="ak-project-guide-heading">
      <div>
        <p className="ak-guide-eyebrow">{t("Example: a reading journal app")}</p>
        <h2 id="project-guide-title">{t("From a conversation to your first implementation")}</h2>
        <p>{t("Start with an idea in your AI chat. Make a draft together, review it yourself, and decide what to build before asking for code.")}</p>
      </div>
      <Link to="/intro" className={buttonVariants({ variant: "ghost", size: "sm" })}><BookOpen aria-hidden="true" />{t("About Alpha Kanban")}</Link>
    </header>
    <SkillInstallPanel />
    <ol className="ak-guide-steps">
      {steps.map((step, index) => <li key={step.title} className="ak-guide-step">
        <span className="ak-guide-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div className="ak-guide-step-description"><h3>{t(step.title)}</h3><p>{t(step.description)}</p></div>
        <div className="ak-guide-step-example">
          {step.prompt ? <ExampleRequest prompt={step.prompt} title={step.title} /> : null}
          {step.replies ? <dl className="ak-guide-replies" aria-label={t("Example conversation continued")}>
            {step.replies.map(([speaker, message]) => <div key={speaker}><dt>{t(speaker)}</dt><dd>{t(message)}</dd></div>)}
          </dl> : null}
          {step.review ? <div className="ak-guide-review"><h4>{t("Your review")}</h4><ul>{step.review.map((item) => <li key={item}>{t(item)}</li>)}</ul></div> : null}
        </div>
      </li>)}
    </ol>
    <p className="ak-project-guide-footnote">{t("Everything can be done in your AI chat. Moving tickets and recording instructions on the board are optional.")}</p>
  </section>;
}
