import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeCopyFields } from "@/features/editor/copyFields";
import { parseTemplate, serializeTemplate } from "@/features/editor/template";
import { evaluateCalc, serializeCalc } from "@/features/editor/calc";
import { calculateIpBlock, serializeIpBlock } from "@/features/editor/ipBlock";
import source from "./bridge.js?raw";
import { writeNoteBackground } from "@/features/viewer/noteAppearance";

// Sabit eylem etiketi ve geçici canlı geri bildirim ayrı DOM öğelerindedir.
function copyButtonText(button: Element | null): string {
  return button?.querySelector(".htnote-widget-status")?.textContent || button?.querySelector(".htnote-widget-label")?.textContent || "";
}

const messages = vi.fn();
let scrollbarShadow: ShadowRoot;

function hostMessage(data: object, sourceWindow: MessageEventSource | null = window.parent) {
  window.dispatchEvent(new MessageEvent("message", { data, source: sourceWindow }));
}

function click(href: string, type = "click") {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = "link";
  document.body.append(link);
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  return event;
}

describe("note bridge", () => {
  beforeAll(() => {
    Object.assign(window, { HTNOTE_TEMPLATE_ENGINE: { parseTemplate }, HTNOTE_CALC_ENGINE: { evaluateCalc }, HTNOTE_IP_ENGINE: { calculateIpBlock } });
    history.replaceState(null, "", "/123e4567-e89b-12d3-a456-426614174000/index.html");
    document.body.innerHTML = '<video controls></video><audio controls></audio>';
    vi.spyOn(window.parent, "postMessage").mockImplementation(messages);
    const attach = Element.prototype.attachShadow;
    const spy = vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, options) {
      const shadow = attach.call(this, options);
      if (this.hasAttribute("data-htnote-scrollbars")) scrollbarShadow = shadow;
      return shadow;
    });
    window.eval(source);
    spy.mockRestore();
    expect(document.querySelector("video")).toHaveAttribute("controlslist", "nodownload");
    expect(document.querySelector("audio")?.hidden).toBe(true);
    expect(document.querySelector(".ht-audio-player")?.shadowRoot).not.toBeNull();
    window.dispatchEvent(new Event("load"));
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_READY", noteId: "123e4567-e89b-12d3-a456-426614174000", path: location.pathname }, "*");
  });

  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-ht-theme");
    messages.mockClear();
    vi.spyOn(window.parent, "postMessage").mockImplementation(messages);
  });

  async function addTextBox() {
    document.body.innerHTML = '<div class="htnote-textbox" data-htnote-widget="textbox"><div class="htnote-textbox-title">Saved title</div><textarea class="htnote-textbox-input" spellcheck="false" rows="3">Saved\n&lt;&amp;</textarea></div>';
    await vi.waitFor(() => expect(document.querySelector('[data-testid="textbox-copy"]')).not.toBeNull());
    hostMessage({ type: "HTNOTE_THEME", labels: { copy: "Copy", copied: "Copied", copyFailed: "Copy failed", reset: "Reset", textboxType: "TEXT BOX" } });
    return document.querySelector("textarea")!;
  }

  it("updates temporary IP defaults, reports errors, copies only valid lists and resets", async () => {
    const saved = serializeIpBlock({ title: "VLAN <script>", gateway: "10.67.106.14", prefix: 28, html: null });
    document.body.innerHTML = saved;
    await vi.waitFor(() => expect(document.querySelector('[data-testid="ipblock-copy"]')).not.toBeNull());
    hostMessage({ type: "HTNOTE_THEME", labels: { locale: "en", ipblockType: "IP BLOCK", ipblockGateway: "Gateway", ipblockPrefix: "Subnet", ipblockCopyList: "Copy list", ipblockSummary: "Block {{block}} · {{count}} addresses", ipblockInvalidIPv4: "Invalid IPv4", ipblockInvalidPrefix: "Invalid subnet", ipblockGatewayBoundary: "Network or broadcast", ipblockEmpty: "Usable addresses appear once a valid IP and subnet are entered.", reset: "Reset", copied: "Copied" } });
    const input = document.querySelector<HTMLInputElement>('[data-testid="ipblock-gateway"]')!;
    const prefix = document.querySelector<HTMLSelectElement>('[data-testid="ipblock-prefix"]')!;
    const list = document.querySelector<HTMLElement>('[data-testid="ipblock-list"]')!;
    const empty = document.querySelector<HTMLElement>('[data-testid="ipblock-empty"]')!;
    const copy = document.querySelector<HTMLButtonElement>('[data-testid="ipblock-copy"]')!;
    const reset = document.querySelector<HTMLButtonElement>('[data-testid="ipblock-reset"]')!;
    const change = (value: string) => { input.value = value; input.dispatchEvent(new Event("input")); };
    expect(list.textContent?.split("\n")).toHaveLength(13); expect(reset.disabled).toBe(true);
    expect(list.hidden).toBe(false); expect(empty.hidden).toBe(true);
    expect(document.querySelector('[data-testid="ipblock-summary"]')?.textContent).toBe("Block 10.67.106.0/28 · 13 addresses");
    expect(document.querySelector(".htnote-ipblock-title")?.textContent).toBe("VLAN <script>");
    expect(document.querySelector(".htnote-ipblock script")).toBeNull();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    prefix.value = "30"; prefix.dispatchEvent(new Event("change"));
    expect(list.textContent).toBe("10.67.106.13"); expect(reset.disabled).toBe(false);
    copy.click(); await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("10.67.106.13"));
    expect(document.querySelector(".htnote-ipblock")?.getAttribute("data-htnote-prefix")).toBe("28");
    change("10.67.106.12");
    expect(input).toHaveAttribute("aria-invalid", "true"); expect(copy.disabled).toBe(true); expect(list.textContent).toBe("");
    expect(list.hidden).toBe(true); expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe("Usable addresses appear once a valid IP and subnet are entered.");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Network or broadcast");
    copy.click(); expect(writeText).toHaveBeenCalledTimes(1);
    change("10.67.300.1"); expect(document.querySelector(".htnote-ipblock-error")?.textContent).toBe("Invalid IPv4");
    expect(list.textContent).toBe(""); expect(copy.disabled).toBe(true);
    expect(list.hidden).toBe(true); expect(empty.hidden).toBe(false);
    prefix.value = ""; prefix.dispatchEvent(new Event("change")); change("10.67.106.14");
    expect(document.querySelector(".htnote-ipblock-error")?.textContent).toBe("Invalid subnet");
    expect(list.hidden).toBe(true); expect(empty.hidden).toBe(false);
    reset.click(); expect(input.value).toBe("10.67.106.14"); expect(prefix.value).toBe("28");
    expect(reset.disabled).toBe(true); expect(copy.disabled).toBe(false); expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby"); expect(list.textContent?.split("\n")).toHaveLength(13);
    expect(list.hidden).toBe(false); expect(empty.hidden).toBe(true);
    change("10.67.106.13"); window.dispatchEvent(new Event("beforeprint"));
    expect(document.querySelector(".htnote-ipblock-print")?.textContent).toBe("Gateway: 10.67.106.13 · Subnet: /28");
    expect(document.querySelector(".htnote-ipblock")?.getAttribute("data-htnote-gw")).toBe("10.67.106.14");
    expect(window.HTNOTE_IP_ENGINE).toBeUndefined();
    Object.assign(window, { HTNOTE_IP_ENGINE: { calculateIpBlock: () => { throw new Error("not script override"); } } });
    change("10.67.106.14"); expect(list.textContent?.split("\n")).toHaveLength(13);
    delete (window as unknown as { HTNOTE_IP_ENGINE?: unknown }).HTNOTE_IP_ENGINE;
  });

  it("validates IP labels, uses literal text and enhances later blocks only once", async () => {
    document.body.innerHTML = serializeIpBlock({ title: "", gateway: "10.67.106.14", prefix: 30, html: null });
    await vi.waitFor(() => expect(document.querySelector('[data-testid="ipblock-copy"]')).not.toBeNull());
    hostMessage({ type: "HTNOTE_THEME", labels: { ipblockCopyList: "Safe copy", ipblockGateway: "Gateway", ipblockType: "IP BLOCK" } });
    hostMessage({ type: "HTNOTE_THEME", labels: { ipblockCopyList: "x".repeat(201), ipblockGateway: 1, ipblockType: [] } });
    expect(copyButtonText(document.querySelector('[data-testid="ipblock-copy"]'))).toBe("Safe copy");
    expect(document.querySelector(".htnote-ipblock-fields label span")?.textContent).toBe("Gateway");
    hostMessage({ type: "HTNOTE_THEME", labels: { ipblockCopyList: "Bad source" } }, null);
    expect(copyButtonText(document.querySelector('[data-testid="ipblock-copy"]'))).toBe("Safe copy");
    hostMessage({ type: "HTNOTE_THEME", labels: { ipblockGateway: "<script>literal</script>" } });
    expect(document.querySelector(".htnote-ipblock-fields label span")?.textContent).toBe("<script>literal</script>");
    expect(document.querySelector(".htnote-ipblock script")).toBeNull();
    document.body.insertAdjacentHTML("beforeend", serializeIpBlock({ title: "Later", gateway: "255.255.255.254", prefix: 30, html: null }));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="ipblock-copy"]')).toHaveLength(2));
    document.querySelector(".htnote-ipblock")!.append(document.createElement("span"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelectorAll('[data-testid="ipblock-copy"]')).toHaveLength(2);
    expect(Array.from(document.querySelectorAll('[data-testid="ipblock-list"]'), (item) => item.textContent)).toEqual(["10.67.106.13", "255.255.255.253"]);
  });

  async function addCalc(content = "Kira = 18.500\nFatura = 2.340 + 870\nKDV = %20 * 4.000\n# comment\n5/0\ntoplam") {
    document.body.innerHTML = serializeCalc({ title: "Budget", content, html: null });
    await vi.waitFor(() => expect(document.querySelector('[data-testid="calc-copy"]')).not.toBeNull());
    hostMessage({ type: "HTNOTE_THEME", labels: { locale: "tr", copy: "Copy", copied: "Copied", copyFailed: "Copy failed", reset: "Reset", calcType: "CALCULATION", calcReset: "Reset", calcCopyTotal: "Copy total", calcTotal: "Total", calcContent: "Expressions", calcError: "Could not calculate", calcLimit: "Limit" } });
    return document.querySelector<HTMLTextAreaElement>(".htnote-calc-input")!;
  }

  it("removes engine globals at startup and ignores subsequent note-script replacements", async () => {
    expect(Object.prototype.hasOwnProperty.call(window, "HTNOTE_TEMPLATE_ENGINE")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(window, "HTNOTE_CALC_ENGINE")).toBe(false);
    const hostile = vi.fn(() => { throw new Error("Note code must not run"); });
    Object.assign(window, { HTNOTE_TEMPLATE_ENGINE: { parseTemplate: hostile }, HTNOTE_CALC_ENGINE: { evaluateCalc: hostile } });
    await addCalc("2+3");
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("5");
    const fields = await addTemplate("{{Ad|Saved}}");
    expect(fields[0].value).toBe("Saved");
    expect(hostile).not.toHaveBeenCalled();
  });

  it("calculates live values, copies formatted total with fallback, resets and keeps default HTML unchanged", async () => {
    const input = await addCalc();
    const original = input.defaultValue, reset = document.querySelector<HTMLButtonElement>('[data-testid="calc-reset"]')!;
    expect(Array.from(document.querySelectorAll('[data-testid="calc-result"]'), (cell) => cell.textContent)).toEqual(["18.500", "3.210", "800", "", "?", "22.510"]);
    expect(document.querySelector('[aria-label="Could not calculate"]')?.textContent).toBe("?");
    expect(reset.disabled).toBe(true);
    input.value = "0,1 + 0,2\n100 + %20"; input.focus(); input.setSelectionRange(1, 3); input.dispatchEvent(new Event("input"));
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("120,3");
    expect(input.defaultValue).toBe(original);
    expect(reset.disabled).toBe(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const copy = document.querySelector<HTMLButtonElement>('[data-testid="calc-copy"]')!;
    copy.click(); await vi.waitFor(() => expect(copy.dataset.feedback).toBe("copied"));
    expect(writeText).toHaveBeenCalledWith("120,3");
    writeText.mockRejectedValue(new Error("clipboard denied"));
    let fallback = "";
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => { fallback = (document.activeElement as HTMLTextAreaElement).value; return true; }) });
    copy.click(); await vi.waitFor(() => expect(fallback).toBe("120,3"));
    expect(input).toHaveFocus(); expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    expect(input.defaultValue).toBe(original);
    window.dispatchEvent(new Event("beforeprint"));
    expect(document.querySelector(".htnote-calc-print")?.textContent).toBe("0,1 + 0,20,3100 + %20120");
    reset.click(); expect(input.value).toBe(original); expect(reset.disabled).toBe(true);
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("22.510");
  });

  it("validates locale and labels, recalculates existing live values and enhances later widgets only once", async () => {
    const input = await addCalc("1,234");
    input.value = "2,345"; input.dispatchEvent(new Event("input"));
    hostMessage({ type: "HTNOTE_THEME", labels: { locale: "en", calcTotal: "<img src=x>", calcCopyTotal: "Copy sum" } });
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("2,345");
    expect(document.querySelector(".htnote-calc-total strong")?.textContent).toBe("<img src=x>");
    expect(document.querySelector("img")).toBeNull();
    hostMessage({ type: "HTNOTE_THEME", labels: { locale: "tr", calcTotal: "Foreign" } }, {} as Window);
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("2,345");
    hostMessage({ type: "HTNOTE_THEME", labels: { locale: "invalid", calcTotal: 2, calcCopyTotal: "x".repeat(201), calcError: [] } });
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("2,345");
    expect(copyButtonText(document.querySelector('[data-testid="calc-copy"]'))).toBe("Copy sum");
    input.value = "18.500"; input.dispatchEvent(new Event("input"));
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("18.500");
    expect(input.defaultValue).toBe("1,234");
    hostMessage({ type: "HTNOTE_THEME", labels: { locale: [] } });
    document.body.insertAdjacentHTML("beforeend", serializeCalc({ title: "Later", content: "2+3", html: null }));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="calc-copy"]')).toHaveLength(2));
    document.querySelector(".htnote-calc")!.append(document.createElement("span"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelectorAll('[data-testid="calc-copy"]')).toHaveLength(2);
    expect(Array.from(document.querySelectorAll('[data-testid="calc-total"]'), (cell) => cell.textContent)).toEqual(["18.500", "5"]);
  });

  it("rejects oversized calculations and safely prints long expressions and literal markup", async () => {
    const input = await addCalc("<&> = 2\n" + "Long label ".repeat(20) + "= 3");
    expect(document.querySelector(".htnote-calc-print pre")?.textContent).toBe("<&> = 2");
    expect(document.querySelector(".htnote-calc-print")?.querySelector("script")).toBeNull();
    input.value = Array(501).fill("1").join("\n"); input.dispatchEvent(new Event("input"));
    expect(document.querySelector('[data-testid="calc-total"]')?.textContent).toBe("0");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Limit");
    expect(document.querySelectorAll(".htnote-calc-print pre")).toHaveLength(1);
    expect(document.querySelector(".htnote-calc-print pre")?.textContent).toBe(input.value);
  });

  async function addTemplate(content = "Sayın {{Ad|Ahmet}}, {{AD}}\nNo: {{No}}\n<&>") {
    document.body.innerHTML = serializeTemplate({ title: "Response", content, html: null });
    await vi.waitFor(() => expect(document.querySelector('[data-testid="template-copy"]')).not.toBeNull());
    hostMessage({ type: "HTNOTE_THEME", labels: { copy: "Copy", copied: "Copied", copyFailed: "Copy failed", templateType: "TEMPLATE", templateReset: "Reset", templatePreview: "Preview" } });
    return Array.from(document.querySelectorAll<HTMLInputElement>('[data-testid="template-variable"]'));
  }

  it("fills repeated variables, safely previews/copies temporary values and resets saved defaults", async () => {
    const fields = await addTemplate();
    const source = document.querySelector<HTMLTextAreaElement>(".htnote-template-source")!;
    const saved = source.defaultValue, sourceHtml = source.innerHTML;
    const reset = document.querySelector<HTMLButtonElement>('[data-testid="template-reset"]')!;
    const preview = document.querySelector('[data-testid="template-preview"]')!;
    expect(source.hidden).toBe(true);
    expect(fields.map((field) => field.value)).toEqual(["Ahmet", ""]);
    expect(fields.map((field) => document.querySelector(`label[for="${field.id}"]`)?.textContent)).toEqual(["Ad", "No"]);
    expect(reset.disabled).toBe(true);
    expect(preview.textContent).toBe("Sayın Ahmet, Ahmet\nNo: No\n<&>");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      document.querySelector<HTMLButtonElement>('[data-testid="template-copy"]')!.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("Sayın Ahmet, Ahmet\nNo: \n<&>"));
      fields[0].value = '<img src=x onerror="alert(1)">'; fields[0].dispatchEvent(new Event("input"));
      expect(reset.disabled).toBe(false);
      expect(preview.textContent).toContain(fields[0].value + ", " + fields[0].value);
      expect(preview.querySelector("img,script,input")).toBeNull();
      expect(Array.from(preview.childNodes).every((node) => node.nodeType === Node.TEXT_NODE || node.nodeName === "SPAN")).toBe(true);
      fields[1].value = "42"; fields[1].dispatchEvent(new Event("input"));
      document.querySelector<HTMLButtonElement>('[data-testid="template-copy"]')!.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`Sayın ${fields[0].value}, ${fields[0].value}\nNo: 42\n<&>`));
      window.dispatchEvent(new Event("beforeprint"));
      expect(preview.textContent).toContain("No: 42");
      reset.click();
      expect(fields.map((field) => field.value)).toEqual(["Ahmet", ""]);
      expect(reset.disabled).toBe(true);
      expect(source.defaultValue).toBe(saved); expect(source.innerHTML).toBe(sourceHtml);
      expect(messages).not.toHaveBeenCalled();
    } finally { delete (navigator as { clipboard?: unknown }).clipboard; }
  });

  it("uses clipboard fallback, restores variable focus/selection and reports failure", async () => {
    const fields = await addTemplate("{{Ad|Saved}} / {{No}}");
    fields[0].focus(); fields[0].setSelectionRange(1, 3);
    const execCommand = vi.fn(() => { expect((document.activeElement as HTMLTextAreaElement).value).toBe("Saved / "); return false; });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    try {
      const copy = document.querySelector<HTMLButtonElement>('[data-testid="template-copy"]')!;
      copy.click();
      await vi.waitFor(() => expect(copyButtonText(copy)).toBe("Copy failed"));
      expect(execCommand).toHaveBeenCalledWith("copy"); expect(fields[0]).toHaveFocus();
      expect([fields[0].selectionStart, fields[0].selectionEnd]).toEqual([1, 3]);
      expect(document.querySelectorAll("textarea")).toHaveLength(1);
    } finally { delete (navigator as { clipboard?: unknown }).clipboard; delete (document as unknown as { execCommand?: unknown }).execCommand; }
  });

  it("handles no variables, late widgets, unique field labels and source updates without duplicate controls", async () => {
    await addTemplate("plain\n{{invalid\nname}}");
    expect(document.querySelector('[data-testid="template-reset"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="template-variable"]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="template-preview"]')?.textContent).toBe("plain\n{{invalid\nname}}");
    document.body.insertAdjacentHTML("beforeend", serializeTemplate({ title: "Second", content: "{{Ad}}", html: null }));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="template-copy"]')).toHaveLength(2));
    const source = document.querySelector<HTMLTextAreaElement>(".htnote-template-source")!;
    source.defaultValue = "{{Ad|Default}}";
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="template-variable"]')).toHaveLength(2));
    const fields = Array.from(document.querySelectorAll<HTMLInputElement>('[data-testid="template-variable"]'));
    expect(new Set(fields.map((field) => field.id)).size).toBe(2);
    expect(fields[0].value).toBe("Default");
    expect(document.querySelectorAll('[data-htnote-widget-header]')).toHaveLength(2);
  });

  it("validates template labels, rejects foreign messages and preserves live values on language changes", async () => {
    const fields = await addTemplate();
    fields[0].value = "Live"; fields[0].dispatchEvent(new Event("input"));
    hostMessage({ type: "HTNOTE_THEME", labels: { templateType: "<img src=x>", templatePreview: "Önizleme", templateReset: "Sıfırla" } });
    expect(document.querySelector('.htnote-widget-type')?.textContent).toBe("<img src=x>");
    expect(document.querySelector('.htnote-template-preview-heading')?.textContent).toBe("Önizleme");
    expect(document.querySelector('[data-testid="template-reset"]')?.textContent).toBe("Sıfırla");
    hostMessage({ type: "HTNOTE_THEME", labels: { templateType: "x".repeat(201), templatePreview: 42, templateReset: [] } });
    hostMessage({ type: "HTNOTE_THEME", labels: { templatePreview: "Foreign" } }, {} as Window);
    expect(document.querySelector('.htnote-template-preview-heading')?.textContent).toBe("Önizleme");
    expect(document.querySelector('.htnote-widget-type')?.textContent).toBe("<img src=x>");
    expect(document.querySelector('img')).toBeNull();
    expect(fields[0].value).toBe("Live");
  });

  async function addCopyFields() {
    document.body.innerHTML = serializeCopyFields({ title: "Fields", html: null, fields: [
      { label: "Host <&>", value: "server.example" }, { label: "", value: "  unlabeled" },
      { label: "Empty", value: "" }, { label: "", value: "" },
    ] });
    await vi.waitFor(() => expect(document.querySelector('[data-testid="copyfields-copy-all"]')).not.toBeNull());
    hostMessage({ type: "HTNOTE_THEME", labels: { copyfieldsType: "COPY FIELDS", copyAll: "Copy all", copyRow: "Copy: {{name}}", copyfieldsRow: "row {{index}}", copied: "Copied", copyFailed: "Copy failed" } });
    return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="copyfields-copy-row"]'));
  }

  it("copies field values by icon and double click, filters empty values from copy-all and clears temporary feedback", async () => {
    const buttons = await addCopyFields();
    const values = Array.from(document.querySelectorAll('dl dd'));
    const before = values.map((value) => value.textContent);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Copy: Host <&>", "Copy:   unlabeled"]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.useFakeTimers();
    try {
      buttons[0].click(); await Promise.resolve(); await Promise.resolve();
      expect(writeText).toHaveBeenLastCalledWith("server.example");
      expect(copyButtonText(buttons[0])).toBe("Copied");
      expect(buttons[0]).toHaveAttribute("aria-live", "polite");
      expect(buttons[0].querySelector(".htnote-widget-status")).toHaveTextContent("Copied");
      expect(buttons[0].getAttribute("aria-label")).toBe("Copy: Host <&>");
      values[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(writeText).toHaveBeenLastCalledWith("  unlabeled");
      expect(copyButtonText(buttons[1])).toBe("Copied");
      document.querySelector<HTMLButtonElement>('[data-testid="copyfields-copy-all"]')!.click();
      await Promise.resolve(); await Promise.resolve();
      expect(writeText).toHaveBeenLastCalledWith("Host <&>: server.example\n  unlabeled");
      vi.advanceTimersByTime(1500);
      expect(copyButtonText(buttons[0])).toBe("");
      expect(buttons[0].querySelector(".htnote-widget-status")).toBeEmptyDOMElement();
      expect(copyButtonText(document.querySelector('[data-testid="copyfields-copy-all"]'))).toBe("Copy all");
      expect(values.map((value) => value.textContent)).toEqual(before);
      expect(document.querySelector('dl input')).toBeNull();
      expect(messages).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); delete (navigator as { clipboard?: unknown }).clipboard; }
  });

  it.each([true, false])("uses copyfields clipboard fallback and restores selection/focus (success=%s)", async (success) => {
    const buttons = await addCopyFields();
    const value = document.querySelector('dl dd')!;
    buttons[0].focus();
    const range = document.createRange(); range.selectNodeContents(value);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    expect(window.getSelection()?.toString()).toBe("server.example");
    const execCommand = vi.fn(() => { expect((document.activeElement as HTMLTextAreaElement).value).toBe("server.example"); return success; });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    try {
      buttons[0].click();
      await vi.waitFor(() => expect(copyButtonText(buttons[0])).toBe(success ? "Copied" : "Copy failed"));
      expect(execCommand).toHaveBeenCalledWith("copy"); expect(buttons[0]).toHaveFocus();
      expect(window.getSelection()?.toString()).toBe("server.example");
      expect(document.querySelector('textarea')).toBeNull();
    } finally { delete (navigator as { clipboard?: unknown }).clipboard; delete (document as unknown as { execCommand?: unknown }).execCommand; }
  });

  it("omits copy buttons for external blank values and handles values becoming empty or filled", async () => {
    await addCopyFields();
    const list = document.querySelector('dl')!;
    list.insertAdjacentHTML("beforeend", '<div class="htnote-copyfields-row"><dt></dt><dd></dd></div><div class="htnote-copyfields-row"><dt>Whitespace</dt><dd> &#9;&nbsp;</dd></div>');
    const rows = Array.from(list.children);
    const blanks = rows.slice(2);
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-testid="copyfields-copy-row"]')).toHaveLength(2);
      blanks.forEach((row) => expect(row.querySelector('button')).toBeNull());
    });
    expect(blanks[0].querySelector('dt')?.textContent).toBe("Empty");
    const value = rows[0].querySelector('dd')!;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      value.textContent = " \t";
      await vi.waitFor(() => expect(rows[0].querySelector('button')).toBeNull());
      value.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      expect(writeText).not.toHaveBeenCalled();
      document.querySelector<HTMLButtonElement>('[data-testid="copyfields-copy-all"]')!.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("  unlabeled"));
      value.textContent = "restored";
      await vi.waitFor(() => expect(rows[0].querySelectorAll('button')).toHaveLength(1));
      value.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("restored"));
    } finally { delete (navigator as { clipboard?: unknown }).clipboard; }
  });

  it("validates copyfields host labels, enhances later rows and widgets once and copies an empty list", async () => {
    await addCopyFields();
    hostMessage({ type: "HTNOTE_THEME", labels: { copyfieldsType: "Untrusted", copyAll: "Untrusted", copyRow: "Untrusted", copyfieldsRow: "Untrusted" } }, null);
    hostMessage({ type: "HTNOTE_THEME", labels: { copyfieldsType: 4, copyAll: "x".repeat(201), copyRow: null, copyfieldsRow: [] } });
    expect(document.querySelector('.htnote-widget-type')?.textContent).toBe("COPY FIELDS");
    expect(copyButtonText(document.querySelector('[data-testid="copyfields-copy-all"]'))).toBe("Copy all");
    const safe = '<img src=x onerror="alert(1)">';
    hostMessage({ type: "HTNOTE_THEME", labels: { copyfieldsType: safe, copyAll: safe } });
    expect(document.querySelector('.htnote-widget-type')?.textContent).toBe(safe);
    expect(document.querySelector('img')).toBeNull();
    const list = document.querySelector('dl')!;
    const row = document.createElement('div'); row.className = 'htnote-copyfields-row';
    const label = document.createElement('dt'), value = document.createElement('dd');
    value.textContent = 'x'.repeat(100); row.append(label, value); list.append(row);
    await vi.waitFor(() => expect(row.querySelector('button')?.getAttribute('aria-label')).toBe('Copy: ' + 'x'.repeat(40)));
    value.textContent = "$& Changed";
    await vi.waitFor(() => expect(row.querySelector('button')?.getAttribute('aria-label')).toBe('Copy: $& Changed'));
    expect(row.querySelectorAll('button')).toHaveLength(1);
    const later = document.createElement('section'); later.innerHTML = serializeCopyFields({ title: '', fields: [], html: null }); document.body.append(later);
    await vi.waitFor(() => expect(later.querySelector('[data-testid="copyfields-copy-all"]')).not.toBeNull());
    expect(later.querySelector('.htnote-widget-type')?.textContent).toBe(safe);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      later.querySelector<HTMLButtonElement>('button')!.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith(""));
    } finally { delete (navigator as { clipboard?: unknown }).clipboard; }
  });

  async function addChecklist(empty = false) {
    document.body.innerHTML = `<div class="htnote-checklist" data-htnote-widget="checklist"><div class="htnote-checklist-title">Saved</div><ul class="htnote-checklist-items">${empty ? "" : '<li><label><input type="checkbox" checked> First &lt;&amp;&gt;</label></li><li><label><input type="checkbox"> Second</label></li><li><label><input type="checkbox">  Third</label></li>'}</ul></div>`;
    await vi.waitFor(() => expect(document.querySelector('[data-testid="checklist-copy"]')).not.toBeNull());
    hostMessage({ type: "HTNOTE_THEME", labels: { checklistType: "CHECKLIST", checklistReset: "Reset", copyRemaining: "Copy remaining", checklistProgress: "Progress", copied: "Copied", copyFailed: "Copy failed" } });
    return Array.from(document.querySelectorAll<HTMLInputElement>('.htnote-checklist-items input'));
  }

  it("keeps checkbox changes temporary, updates silent progress and resets to saved defaults", async () => {
    const inputs = await addChecklist();
    const reset = document.querySelector<HTMLButtonElement>('[data-testid="checklist-reset"]')!;
    const progress = document.querySelector('[role="progressbar"]')!;
    const counter = document.querySelector('[data-testid="checklist-counter"]')!;
    expect(reset.disabled).toBe(true);
    expect(counter.textContent).toBe("1 / 3");
    expect(counter.closest("[aria-live]")).toBeNull();
    expect(progress.getAttribute("aria-valuenow")).toBe("1");
    expect(progress.getAttribute("aria-valuemax")).toBe("3");
    inputs[0].click(); inputs[1].click();
    expect(inputs.map((input) => input.checked)).toEqual([false, true, false]);
    expect(inputs.map((input) => input.defaultChecked)).toEqual([true, false, false]);
    expect(reset.disabled).toBe(false);
    inputs[2].click();
    expect(counter.textContent).toBe("2 / 3");
    expect(progress.getAttribute("aria-valuenow")).toBe("2");
    reset.click();
    expect(inputs.map((input) => input.checked)).toEqual([true, false, false]);
    expect(reset.disabled).toBe(true);
    expect(messages).not.toHaveBeenCalled();
  });

  it("copies only remaining plain text and reports clipboard success briefly", async () => {
    const inputs = await addChecklist();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      const copy = document.querySelector<HTMLButtonElement>('[data-testid="checklist-copy"]')!;
      copy.click();
      await vi.waitFor(() => expect(copyButtonText(copy)).toBe("Copied"));
      expect(writeText).toHaveBeenLastCalledWith("Second\n Third");
      await vi.waitFor(() => expect(copyButtonText(copy)).toBe("Copy remaining"), { timeout: 2200 });
      inputs[0].click(); inputs[1].click(); inputs[2].click();
      copy.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("First <&>"));
      inputs[0].click(); copy.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith(""));
    } finally { delete (navigator as { clipboard?: unknown }).clipboard; }
  });

  it("hides external blank items and excludes them from progress, reset and remaining copies", async () => {
    await addChecklist();
    const list = document.querySelector('.htnote-checklist-items')!;
    list.insertAdjacentHTML("beforeend", '<li><label><input type="checkbox" checked> </label></li><li><label><input type="checkbox"> &#9;&nbsp;</label></li>');
    const blanks = Array.from(list.querySelectorAll<HTMLLIElement>('li')).slice(3);
    const counter = document.querySelector('[data-testid="checklist-counter"]')!;
    const progress = document.querySelector('[role="progressbar"]')!;
    await vi.waitFor(() => blanks.forEach((row) => expect(row.hidden).toBe(true)));
    expect(counter.textContent).toBe("1 / 3");
    expect(progress).toHaveAttribute("aria-valuemax", "3");
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    blanks[0].querySelector<HTMLInputElement>('input')!.click();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="checklist-reset"]')!.disabled).toBe(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      document.querySelector<HTMLButtonElement>('[data-testid="checklist-copy"]')!.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("Second\n Third"));
      blanks[1].querySelector('label')!.append("Now filled");
      await vi.waitFor(() => expect(counter.textContent).toBe("1 / 4"));
      expect(blanks[1].hidden).toBe(false);
      list.replaceChildren(...blanks.slice(0, 1));
      await vi.waitFor(() => expect(counter.textContent).toBe("0 / 0"));
      expect(progress).toHaveAttribute("aria-valuemax", "0");
      expect(progress).toHaveAttribute("aria-valuenow", "0");
    } finally { delete (navigator as { clipboard?: unknown }).clipboard; }
  });

  it.each([true, false])("copies through a temporary textarea fallback, preserving focus and selection (success=%s)", async (success) => {
    await addChecklist();
    const field = document.createElement("input");
    field.value = "Focus stays here"; document.body.append(field);
    field.focus(); field.setSelectionRange(2, 6, "backward");
    const range = document.createRange(); range.selectNodeContents(document.querySelector('.htnote-checklist-title')!);
    window.getSelection()?.addRange(range);
    const selectedText = window.getSelection()?.toString();
    const execCommand = vi.fn(() => {
      const input = document.activeElement as HTMLTextAreaElement;
      expect(input.tagName).toBe("TEXTAREA");
      expect(input.value).toBe("Second\n Third");
      expect(input.selectionEnd).toBe(input.value.length);
      return success;
    });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Policy")) } });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    try {
      const copy = document.querySelector<HTMLButtonElement>('[data-testid="checklist-copy"]')!;
      copy.click();
      await vi.waitFor(() => expect(copyButtonText(copy)).toBe(success ? "Copied" : "Copy failed"));
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([2, 6, "backward"]);
      expect(window.getSelection()?.toString()).toBe(selectedText);
      expect(document.querySelector("textarea")).toBeNull();
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
      delete (document as unknown as { execCommand?: unknown }).execCommand;
    }
  });

  it("supports empty and later lists, accepts only bounded host labels as text", async () => {
    await addChecklist(true);
    expect(document.querySelector('[data-testid="checklist-counter"]')?.textContent).toBe("0 / 0");
    const reset = document.querySelector<HTMLButtonElement>('[data-testid="checklist-reset"]')!;
    expect(reset.disabled).toBe(true);
    hostMessage({ type: "HTNOTE_THEME", labels: { checklistType: "Untrusted", copyRemaining: "Untrusted" } }, null);
    hostMessage({ type: "HTNOTE_THEME", labels: { checklistType: 4, copyRemaining: "x".repeat(201) } });
    expect(document.querySelector('.htnote-widget-type')?.textContent).toBe("CHECKLIST");
    expect(copyButtonText(document.querySelector('[data-testid="checklist-copy"]'))).toBe("Copy remaining");
    const safe = "<img onerror=x()>";
    hostMessage({ type: "HTNOTE_THEME", labels: { checklistType: safe, copyRemaining: safe, checklistProgress: "x".repeat(200) } });
    expect(document.querySelector('.htnote-widget-type')?.textContent).toBe(safe);
    expect(document.querySelector("img")).toBeNull();
    const list = document.querySelector('.htnote-checklist-items')!;
    list.innerHTML = '<li><label><input type="checkbox" checked> Later</label></li>';
    await vi.waitFor(() => expect(document.querySelector('[data-testid="checklist-counter"]')?.textContent).toBe("1 / 1"));
    expect(document.querySelectorAll('[data-testid="checklist-copy"]')).toHaveLength(1);
    const later = document.createElement("div");
    later.innerHTML = '<div data-htnote-widget="checklist"><div class="htnote-checklist-title">Later</div><ul class="htnote-checklist-items"></ul></div>';
    document.body.append(later);
    await vi.waitFor(() => expect(later.querySelector('[data-testid="checklist-reset"]')).not.toBeNull());
    expect(later.querySelector('.htnote-widget-type')?.textContent).toBe(safe);
  });

  it("provides shared background rules and accepts widget theme variables through the existing theme message", async () => {
    await addTextBox();
    const box = document.querySelector('[data-htnote-widget="textbox"]')!;
    box.setAttribute("data-htnote-bg", "mint");
    const css = document.getElementById("htnote-textbox-base")!.textContent!;
    expect(css).toContain(':where([data-htnote-widget][data-htnote-bg="mint"])');
    expect(css).toContain("--ht-note-mint:");
    hostMessage({ type: "HTNOTE_THEME", mode: "dark", vars: { "--ht-widget-accent": "host-accent", "--ht-note-mint": "host-background" } });
    expect(document.documentElement.style.getPropertyValue("--ht-widget-accent")).toBe("host-accent");
    expect(document.documentElement.style.getPropertyValue("--ht-note-mint")).toBe("host-background");
    expect(box.getAttribute("data-htnote-bg")).toBe("mint");
    document.documentElement.style.removeProperty("--ht-widget-accent");
    document.documentElement.style.removeProperty("--ht-note-mint");
  });

  it("enhances new boxes only once, resets transient values and mirrors complete text for print", async () => {
    const input = await addTextBox();
    const reset = document.querySelector<HTMLButtonElement>('[data-testid="textbox-reset"]')!;
    expect(reset.disabled).toBe(true);
    input.value = "Changed\n" + "long line\n".repeat(20);
    input.dispatchEvent(new Event("input"));
    expect(reset.disabled).toBe(false);
    expect(document.querySelector(".htnote-textbox-print")?.textContent).toBe(input.value);
    expect(document.querySelector(".htnote-textbox-title")?.textContent).toBe("Saved title");
    reset.click();
    expect(input.value).toBe(input.defaultValue);
    expect(reset.disabled).toBe(true);
    document.querySelector(".htnote-textbox")!.append(document.createElement("span"));
    await Promise.resolve();
    expect(document.querySelectorAll("[data-htnote-widget-header]")).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="textbox-copy"]')).toHaveLength(1);
    hostMessage({ type: "HTNOTE_THEME", labels: { copy: 4, reset: "x".repeat(201) } });
    expect(copyButtonText(document.querySelector('[data-testid="textbox-copy"]'))).toBe("Copy");
    expect(reset.textContent).toBe("Reset");
  });

  it("validates host type labels, renders them as text and updates existing and later widget headers", async () => {
    await addTextBox();
    const header = document.querySelector("[data-htnote-widget-header]")!;
    expect(header.textContent).toContain("TEXT BOX");
    hostMessage({ type: "HTNOTE_THEME", labels: { textboxType: "Untrusted" } }, null);
    hostMessage({ type: "HTNOTE_THEME", labels: { textboxType: 4 } });
    hostMessage({ type: "HTNOTE_THEME", labels: { textboxType: "x".repeat(201) } });
    hostMessage({ type: "HTNOTE_THEME", labels: ["Untrusted"] });
    expect(header.textContent).toContain("TEXT BOX");
    const label = "<img src=x onerror=alert(1)>";
    hostMessage({ type: "HTNOTE_THEME", labels: { textboxType: label } });
    expect(header.textContent).toContain(label);
    expect(header.querySelector("img")).toBeNull();
    const later = document.createElement("div");
    later.innerHTML = '<div data-htnote-widget="textbox"><div class="htnote-textbox-title">Later</div><textarea class="htnote-textbox-input">Value</textarea></div>';
    document.body.append(later);
    await vi.waitFor(() => expect(document.querySelectorAll("[data-htnote-widget-header]")).toHaveLength(2));
    expect(later.textContent).toContain(label);
    hostMessage({ type: "HTNOTE_THEME", labels: { textboxType: "x".repeat(200) } });
    expect(header.textContent).toContain("x".repeat(200));
    hostMessage({ type: "HTNOTE_THEME", labels: { textboxType: "METİN KUTUSU" } });
    expect(header.textContent).toContain("METİN KUTUSU");
    expect(later.textContent).toContain("METİN KUTUSU");
    expect(document.querySelector("[data-htnote-widget-header]")).toBe(header);
  });

  it("copies the live text through the clipboard API with brief feedback", async () => {
    const input = await addTextBox();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    input.value = "Current text";
    const copy = document.querySelector<HTMLButtonElement>('[data-testid="textbox-copy"]')!;
    copy.click();
    await vi.waitFor(() => expect(copyButtonText(copy)).toBe("Copied"));
    expect(writeText).toHaveBeenCalledWith("Current text");
    await vi.waitFor(() => expect(copyButtonText(copy)).toBe("Copy"), { timeout: 2200 });
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it.each([true, false])("falls back in the iframe and restores focus/selection (success=%s)", async (success) => {
    const input = await addTextBox();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Policy")) } });
    const copyCommand = vi.fn(() => {
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
      return success;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: copyCommand });
    input.focus(); input.setSelectionRange(2, 4, "backward");
    const copy = document.querySelector<HTMLButtonElement>('[data-testid="textbox-copy"]')!;
    copy.click();
    await vi.waitFor(() => expect(copyButtonText(copy)).toBe(success ? "Copied" : "Copy failed"));
    expect(copyCommand).toHaveBeenCalledWith("copy");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 4, "backward"]);
    delete (navigator as { clipboard?: unknown }).clipboard;
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it.each([
    ["<div data-target></div>", true],
    ['<input type="checkbox" data-target>', true],
    ['<input type="search" data-target>', false],
    ["<textarea data-target></textarea>", false],
    ['<div contenteditable><span data-target></span></div>', false],
    ['<div contenteditable="plaintext-only"><span data-target></span></div>', false],
    ['<div contenteditable><span contenteditable="false" data-target></span></div>', true],
    ['<div class="cm-editor"><span data-target></span></div>', false],
    ['<div contenteditable><video data-target></video></div>', true],
  ])("guards native menus locally: %s", (html, prevented) => {
    document.body.innerHTML = html;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector("[data-target]")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(prevented);
    expect(messages).not.toHaveBeenCalled();
  });

  it("allows copying a selection only when it intersects its context menu target", () => {
    document.body.innerHTML = "<p><strong>Selected text</strong></p><div>Other</div><video></video>";
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("strong")!);
    selection.addRange(range);
    const dispatch = (element: Element) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(dispatch(document.querySelector("p")!)).toBe(false);
    expect(dispatch(document.querySelector("div")!)).toBe(true);
    range.selectNodeContents(document.querySelector("video")!);
    expect(dispatch(document.querySelector("video")!)).toBe(true);
    range.collapse(true);
    expect(dispatch(document.querySelector("p")!)).toBe(true);
    document.querySelector("p")!.textContent = "   ";
    range.selectNodeContents(document.querySelector("p")!);
    expect(dispatch(document.querySelector("p")!)).toBe(true);
    expect(messages).not.toHaveBeenCalled();
  });

  it("allows copying a selection spanning paragraphs only on intersecting targets", () => {
    document.body.innerHTML = "<section><p>First paragraph</p><p>Middle paragraph</p><p>Last paragraph</p><p>Other text</p></section>";
    const [first, middle, last, other] = document.querySelectorAll("p");
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(first.firstChild!, 2);
    range.setEnd(last.firstChild!, 4);
    selection.addRange(range);
    const dispatch = (target: EventTarget) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const paragraph of [first, middle, last]) {
      expect(dispatch(paragraph)).toBe(false);
      expect(dispatch(paragraph.firstChild!)).toBe(false);
    }
    expect(dispatch(other)).toBe(true);
    expect(messages).not.toHaveBeenCalled();
  });

  it("lets a custom menu handle the event before the bubbling guard", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const custom = vi.fn((event: Event) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener("contextmenu", custom);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    expect(custom).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("forwards and prevents settings shortcut when the note has focus", () => {
    const event = new KeyboardEvent("keydown", { key: ",", code: "Comma", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SHORTCUT", key: ",", ctrl: true, shift: false, alt: false, meta: false }, "*");
  });

  it("exposes frozen note metadata", () => {
    expect(Object.isFrozen((window as unknown as { htnote: object }).htnote)).toBe(true);
  });

  it("uses low-specificity theme defaults and the portable preset stylesheet", () => {
    expect(document.getElementById("htnote-scrollbars")?.textContent).toContain(":where(html){background:var(--ht-note-bg,var(--ht-bg));color:var(--ht-text);font-family:var(--ht-font,system-ui,-apple-system,sans-serif)");
    const saved = writeNoteBackground('<html><head></head><body><p>Note</p></body></html>', "sepia");
    const note = new DOMParser().parseFromString(saved, "text/html");
    expect(note.body.dataset.htBg).toBe("sepia");
    expect(note.getElementById("htnote-appearance")?.textContent).toContain(':where(html:has(body[data-ht-bg="sepia"]))');
    expect(note.getElementById("htnote-appearance")?.textContent).toContain(':where(html[data-ht-theme="dark"])');
    hostMessage({ type: "HTNOTE_THEME", mode: "dark", vars: { "--ht-bg": "#1e293b", "--ht-text": "#f1f5f9", "--ht-color-red": "#fb929e" } });
    expect(document.documentElement.dataset.htTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("#1e293b");
    expect(document.documentElement.style.getPropertyValue("--ht-color-red")).toBe("#fb929e");
    document.documentElement.style.removeProperty("--ht-bg");
    document.documentElement.style.removeProperty("--ht-text");
    document.documentElement.style.removeProperty("--ht-color-red");
  });

  it("injects one low-specificity scrollbar stylesheet and follows trusted theme tokens", () => {
    const styles = document.querySelectorAll("#htnote-scrollbars");
    expect(styles).toHaveLength(1);
    expect(styles[0].parentElement).toBe(document.head);
    expect(document.head.firstElementChild).toBe(styles[0]);
    expect(styles[0].textContent).toContain(":where(*)::-webkit-scrollbar-thumb");
    expect(styles[0].textContent).toContain("scrollbar-width:thin");
    expect(styles[0].textContent).not.toContain("!important");
    for (const mode of ["light", "dark"]) {
      const vars = { "--ht-scrollbar": `var(--${mode}-thumb)`, "--ht-scrollbar-hover": `var(--${mode}-hover)` };
      hostMessage({ type: "HTNOTE_THEME", vars, mode }, null);
      expect(document.documentElement.style.getPropertyValue("--ht-scrollbar")).not.toBe(vars["--ht-scrollbar"]);
      hostMessage({ type: "HTNOTE_THEME", vars, mode });
      expect(document.documentElement.style.getPropertyValue("--ht-scrollbar")).toBe(vars["--ht-scrollbar"]);
      expect(document.documentElement.style.getPropertyValue("--ht-scrollbar-hover")).toBe(vars["--ht-scrollbar-hover"]);
      expect(document.documentElement.dataset.htTheme).toBe(mode);
    }
    expect(document.querySelectorAll("#htnote-scrollbars")).toHaveLength(1);
    const author = document.createElement("style");
    author.textContent = ".author-scroll { scrollbar-width: auto; }";
    document.head.append(author);
    const scroller = document.createElement("div");
    document.body.append(scroller);
    expect(getComputedStyle(scroller).scrollbarWidth).toBe("thin");
    scroller.className = "author-scroll";
    expect(getComputedStyle(scroller).scrollbarWidth).toBe("auto");
    author.remove();
  });

  it("routes note and external links, blocks unsafe links, and leaves anchors alone", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(click(`htnote://note/${id}`).defaultPrevented).toBe(true);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_OPEN_NOTE", id }, "*");
    expect(click("https://example.com", "auxclick").defaultPrevented).toBe(true);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }, "*");
    expect(click("mailto:test@example.com").defaultPrevented).toBe(true);
    messages.mockClear();
    for (const url of ["javascript:alert(1)", "file:///test", "htnote-note://localhost/a", "htnote://note/invalid"]) {
      expect(click(url).defaultPrevented).toBe(true);
    }
    expect(messages).not.toHaveBeenCalled();
    expect(click("#section").defaultPrevented).toBe(false);
  });

  it("routes window.open only for external URLs", () => {
    expect(window.open("https://example.com")).toBeNull();
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }, "*");
    messages.mockClear();
    expect(window.open("javascript:alert(1)")).toBeNull();
    expect(messages).not.toHaveBeenCalled();
  });

  it("forwards relative attachment links without resolving or decoding their paths", () => {
    for (const href of ["./assets/report.pdf", "assets/report.PDF", "./assets/%C4%B0stanbul%20rapor.pdf", "assets/a%25b%23c.txt"]) {
      expect(click(href, "auxclick").defaultPrevented).toBe(true);
      expect(messages).toHaveBeenLastCalledWith({ type: "HTNOTE_OPEN_ASSET", relPath: href }, "*");
    }
    messages.mockClear();
    for (const href of ["../assets/report.pdf", "/assets/report.pdf", "other/report.pdf", "//evil.test/assets/report.pdf"]) {
      expect(click(href).defaultPrevented).toBe(true);
    }
    expect(messages).not.toHaveBeenCalled();
  });

  it("prints only when the parent requests it", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    hostMessage({ type: "HTNOTE_PRINT" }, null);
    expect(print).not.toHaveBeenCalled();
    hostMessage({ type: "HTNOTE_PRINT" });
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it("forwards modifier shortcuts and Escape, preventing only recognized combinations", () => {
    const key = (name: string, code: string, options: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key: name, code, bubbles: true, cancelable: true, ...options });
      document.dispatchEvent(event);
      return event;
    };
    expect(key("s", "KeyS", { ctrlKey: true }).defaultPrevented).toBe(true);
    for (const letter of ["e", "w", "n"]) {
      expect(key(letter, `Key${letter.toUpperCase()}`, { ctrlKey: true }).defaultPrevented).toBe(true);
    }
    expect(key("N", "KeyN", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("F", "KeyF", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("Tab", "Tab", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("Tab", "Tab", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("\\", "Backslash", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("/", "Digit7", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("/", "NumpadDivide", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("B", "KeyB", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("Escape", "Escape").defaultPrevented).toBe(true);
    expect(key("x", "KeyX", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key("s", "KeyS", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(key("x", "KeyX").defaultPrevented).toBe(false);
    expect(messages).toHaveBeenCalledTimes(15);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SHORTCUT", key: "s", ctrl: true, shift: false, alt: false, meta: false }, "*");
  });

  it("handles Mac Mod and Ctrl tab shortcuts and forwards other modifier keys", () => {
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const key = (name: string, code: string, options: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key: name, code, bubbles: true, cancelable: true, ...options });
      document.dispatchEvent(event);
      return event;
    };
    try {
      expect(key("s", "KeyS", { metaKey: true }).defaultPrevented).toBe(true);
      expect(key("s", "KeyS", { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(key("Tab", "Tab", { metaKey: true }).defaultPrevented).toBe(false);
      expect(key("Tab", "Tab", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false);
      expect(key("Tab", "Tab", { ctrlKey: true }).defaultPrevented).toBe(true);
      expect(key("Tab", "Tab", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
      expect(key("Escape", "Escape", { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(key("x", "KeyX", { altKey: true }).defaultPrevented).toBe(false);
      expect(key("x", "KeyX", { shiftKey: true }).defaultPrevented).toBe(false);
      expect(messages).toHaveBeenCalledTimes(9);
      expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SHORTCUT", key: "Escape", ctrl: true, shift: false, alt: false, meta: false }, "*");
    } finally {
      platform.mockRestore();
    }
  });

  it("applies trusted theme messages and highlights Turkish matches, then clears them", () => {
    document.body.innerHTML = "<p>İ i I ı</p><script>İ i</script><style>İ i</style>";
    hostMessage({ type: "HTNOTE_THEME", vars: { "--ht-bg": "red", "--other": "blue" }, mode: "dark" }, null);
    expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("");
    hostMessage({ type: "HTNOTE_THEME", vars: { "--ht-bg": "red", "--other": "blue" }, mode: "dark" });
    expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("red");
    expect(document.documentElement.style.getPropertyValue("--other")).toBe("");
    expect(document.documentElement.dataset.htTheme).toBe("dark");
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "i" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["İ", "i"]);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "ı" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["I", "ı"]);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(0);
    expect(document.querySelector("p")?.textContent).toBe("İ i I ı");
  });

  it("keeps source offsets when Turkish folding changes text length", () => {
    document.body.innerHTML = "<p>I\u0307i İi Iı</p>";
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "İi" });
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["I\u0307i", "İi"]);
    expect(document.querySelector("p")?.textContent).toBe("I\u0307i İi Iı");
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "Iı" });
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["Iı"]);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "" });
    expect(document.querySelector("p")?.textContent).toBe("I\u0307i İi Iı");
  });

  it("highlights separate text nodes and clears marks without removing elements", () => {
    document.body.innerHTML = "<p>İstanbul <strong>istanbul</strong></p>";
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "istanbul" });
    expect(document.querySelectorAll("mark.htnote-highlight")).toHaveLength(2);
    hostMessage({ type: "HTNOTE_CLEAR_HIGHLIGHT" });
    expect(document.querySelectorAll("mark.htnote-highlight")).toHaveLength(0);
    expect(document.querySelector("strong")?.textContent).toBe("istanbul");
  });

  it("restores scroll only from the parent and reports scroll changes", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    hostMessage({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 42 }, null);
    expect(scrollTo).not.toHaveBeenCalled();
    hostMessage({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 42, token: "document-token" });
    expect(scrollTo).toHaveBeenCalledWith(0, 42);
    window.dispatchEvent(new Event("scroll"));
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SCROLL", scrollY: window.scrollY, path: location.pathname, token: "document-token" }, "*");
    frame.mockRestore();
    scrollTo.mockRestore();
  });

  it("constrains media with low specificity so author sizes win", () => {
    expect(document.querySelector("#htnote-paragraph-base")?.textContent)
      .toBe(":where(#htnote-content p){margin:0.3em 0;min-height:1lh}");
    expect(document.querySelector("#htnote-media-base")?.textContent).toContain(":where(video,img){max-width:100%;height:auto}");
    expect(document.querySelector("#htnote-media-base")?.textContent).toContain(":where(video){max-height:75vh}");
    const author = document.createElement("style");
    author.textContent = "video.author-video { max-height: 900px; max-width: 70%; }";
    document.head.append(author);
    document.body.innerHTML = '<video class="author-video"></video>';
    expect(getComputedStyle(document.querySelector("video")!).maxHeight).toBe("900px");
    expect(getComputedStyle(document.querySelector("video")!).maxWidth).toBe("70%");
    author.remove();
  });

  it("enhances dynamically added media, preserves control tokens and blocks video saving", async () => {
    document.body.innerHTML = '<video controls controlslist="noremoteplayback"></video><audio data-ht-native controls></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const video = document.querySelector("video")!;
    expect(video).toHaveAttribute("controlslist", "noremoteplayback nodownload");
    expect(document.querySelector("audio")).toHaveAttribute("controlslist", "nodownload");
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    video.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    const dynamic = document.createElement("video");
    document.body.append(dynamic);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dynamic).toHaveAttribute("controlslist", "nodownload");
  });

  it("wraps only audio with controls, supports native opt-out and restores removed players", async () => {
    document.body.innerHTML = '<audio controls src="./assets/a.wav"></audio><audio controls data-ht-native></audio><audio></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [audio, native, scriptOnly] = document.querySelectorAll("audio");
    expect(document.querySelectorAll(".ht-audio-player")).toHaveLength(1);
    expect(audio.hidden).toBe(true);
    expect(native.hidden).toBe(false);
    expect(scriptOnly.hidden).toBe(false);
    audio.setAttribute("data-ht-native", "");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector(".ht-audio-player")).toBeNull();
    expect(audio.hidden).toBe(false);
    audio.removeAttribute("data-ht-native");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const host = document.querySelector(".ht-audio-player")!;
    expect(host.shadowRoot?.querySelector(".ht-audio-title")).toHaveTextContent("a.wav");
    audio.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.isConnected).toBe(false);
    expect(audio.hidden).toBe(false);
  });

  it("localizes shadow controls and follows trusted theme changes without rebuilding audio", async () => {
    document.body.innerHTML = '<audio controls src="./assets/a.wav"></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const audio = document.querySelector("audio")!;
    const shadow = document.querySelector(".ht-audio-player")!.shadowRoot!;
    const labels = { play: "Oynat", pause: "Duraklat", mute: "Sesi kapat", unmute: "Sesi aç", seek: "Ses konumu" };
    hostMessage({ type: "HTNOTE_THEME", mode: "dark", vars: { "--ht-audio-surface": "dark-card" }, audioLabels: labels }, null);
    expect(shadow.querySelector("button")).not.toHaveAttribute("aria-label", "Oynat");
    hostMessage({ type: "HTNOTE_THEME", mode: "dark", vars: { "--ht-audio-surface": "dark-card" }, audioLabels: labels });
    expect(shadow.querySelector("button")).toHaveAttribute("aria-label", "Oynat");
    expect(document.documentElement.style.getPropertyValue("--ht-audio-surface")).toBe("dark-card");
    hostMessage({ type: "HTNOTE_THEME", mode: "light", vars: { "--ht-audio-surface": "light-card" }, audioLabels: { play: "Play" } });
    expect(shadow.querySelector("button")).toHaveAttribute("title", "Play");
    expect(document.documentElement.style.getPropertyValue("--ht-audio-surface")).toBe("light-card");
    expect(document.querySelector("audio")).toBe(audio);
    expect(shadow.querySelector("style")?.textContent).toContain("prefers-reduced-motion:reduce");
  });

  it("plays, mutes and seeks shadow audio with keyboard and pointer controls", async () => {
    document.body.innerHTML = '<audio controls title="Recording"><source src="./assets/test.wav"></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const audio = document.querySelector("audio")!;
    let paused = true;
    Object.defineProperties(audio, { duration: { configurable: true, value: 125 }, paused: { configurable: true, get: () => paused } });
    const play = vi.spyOn(audio, "play").mockImplementation(async () => { paused = false; audio.dispatchEvent(new Event("play")); });
    const pause = vi.spyOn(audio, "pause").mockImplementation(() => { paused = true; audio.dispatchEvent(new Event("pause")); });
    audio.dispatchEvent(new Event("loadedmetadata"));
    const shadow = document.querySelector(".ht-audio-player")!.shadowRoot!;
    const slider = shadow.querySelector<HTMLElement>("[role=slider]")!;
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(play).toHaveBeenCalledOnce();
    expect(shadow.querySelector(".ht-audio-card")).toHaveAttribute("data-playing", "true");
    shadow.querySelector<HTMLButtonElement>(".ht-audio-play")!.click();
    expect(pause).toHaveBeenCalledOnce();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(audio.currentTime).toBe(5);
    expect(slider).toHaveAttribute("aria-valuenow", "5");
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(audio.currentTime).toBe(0);
    expect(shadow.querySelector(".ht-audio-time")).toHaveTextContent("0:00 / 2:05");
    slider.setPointerCapture = vi.fn(); slider.hasPointerCapture = () => true; slider.releasePointerCapture = vi.fn();
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 10, width: 100 } as DOMRect);
    slider.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 60, bubbles: true }));
    expect(audio.currentTime).toBe(62.5);
    slider.dispatchEvent(new MouseEvent("pointermove", { clientX: 110, bubbles: true }));
    expect(audio.currentTime).toBe(125);
    shadow.querySelector<HTMLButtonElement>(".ht-audio-mute")!.click();
    expect(audio.muted).toBe(true);
    expect(shadow.querySelector(".ht-audio-title small")).toHaveTextContent("test.wav");
  });

  it("uses light theme for print mode", () => {
    history.replaceState(null, "", `${location.pathname}?print=1`);
    try {
      window.eval(source);
      expect(document.querySelectorAll("#htnote-scrollbars")).toHaveLength(1);
      expect(document.documentElement.dataset.htTheme).toBe("light");
      expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("#f9fafb");
      expect(document.documentElement.style.getPropertyValue("--ht-text")).toBe("#111827");
    } finally {
      history.replaceState(null, "", location.pathname);
    }
  });

  it("applies content width via low-specificity style sheet allowing author styles to win", () => {
    const baseStyle = document.createElement("style");
    baseStyle.setAttribute("data-htnote", "base");
    baseStyle.textContent = "body { max-width: 860px; margin: 0 auto; }";
    document.head.append(baseStyle);

    hostMessage({ type: "HTNOTE_CONTENT_WIDTH", contentWidth: "narrow" });
    expect(document.documentElement.dataset.htContentWidth).toBe("narrow");
    const styleEl = document.getElementById("htnote-content-width");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain(":where(body){max-width:680px");
    // Verify base style's body selector was rewritten to :where(body) to maintain low specificity
    expect(baseStyle.textContent).toContain(":where(body)");

    hostMessage({ type: "HTNOTE_CONTENT_WIDTH", contentWidth: "full" });
    expect(document.documentElement.dataset.htContentWidth).toBe("full");
    expect(styleEl?.textContent).toContain(":where(body){max-width:100%");

    // Author style test: author's body style has specificity (0,0,1) which wins over :where(body) (0,0,0)
    const authorStyle = document.createElement("style");
    authorStyle.textContent = "body { max-width: 550px; }";
    document.head.append(authorStyle);

    expect(getComputedStyle(document.body).maxWidth).toBe("550px");

    authorStyle.remove();
    baseStyle.remove();
    styleEl?.remove();
  });
});

it("isolates root overlay geometry, scroll visibility and drag in a closed shadow", () => {
  const root = document.documentElement;
  const host = root.querySelector<HTMLElement>("[data-htnote-scrollbars]")!;
  expect(host.shadowRoot).toBeNull();
  expect(host.style.position).toBe("fixed");
  expect(host.style.getPropertyPriority("all")).toBe("important");
  expect(getComputedStyle(root).scrollbarWidth).toBe("none");
  expect(scrollbarShadow.querySelector("style")?.textContent).toContain("@media print");
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: root });
  Object.defineProperties(root, { clientHeight: { configurable: true, value: 100 }, scrollHeight: { configurable: true, value: 400 } });
  root.scrollTop = 0;
  window.dispatchEvent(new Event("scroll"));
  const track = scrollbarShadow.querySelector<HTMLElement>(".vertical")!;
  const thumb = track.querySelector<HTMLElement>(".thumb")!;
  expect(track.dataset.visible).toBe("true");
  expect(thumb.style.height).toBe("25px");
  vi.useFakeTimers();
  try {
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(800);
    expect(track.dataset.visible).toBe("false");
    hostMessage({ type: "HTNOTE_THEME", vars: { "--ht-reduced-motion": "1" } });
    window.dispatchEvent(new Event("scroll"));
    expect(host.dataset.reducedMotion).toBe("true");
    expect(scrollbarShadow.querySelector("style")?.textContent).toContain(":host([data-reduced-motion=true]) .track{transition:none}");
  } finally {
    document.documentElement.style.removeProperty("--ht-reduced-motion");
    vi.useRealTimers();
  }

  thumb.setPointerCapture = vi.fn();
  const pointer = (type: string, y: number) => {
    const event = new MouseEvent(type, { clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    thumb.dispatchEvent(event);
  };
  pointer("pointerdown", 10); pointer("pointermove", 35);
  expect(root.scrollTop).toBe(100);
  pointer("pointercancel", 35);
  const author = document.createElement("style"); author.textContent = "html { scrollbar-width: auto; }"; document.head.append(author);
  window.dispatchEvent(new Event("scroll"));
  expect(getComputedStyle(root).scrollbarWidth).toBe("auto");
  expect(track.style.display).toBe("none");
  author.remove();
  delete (document as unknown as { scrollingElement?: Element }).scrollingElement;
  delete (root as unknown as { clientHeight?: number }).clientHeight;
  delete (root as unknown as { scrollHeight?: number }).scrollHeight;
});
