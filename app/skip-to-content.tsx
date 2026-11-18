"use client";

export function SkipToContent() {
  function onClick() {
    const main = document.getElementById("main-content");
    if (main instanceof HTMLElement) {
      main.focus();
    }
  }

  return (
    <a href="#main-content" className="skip-link" onClick={onClick}>
      Skip to content
    </a>
  );
}
