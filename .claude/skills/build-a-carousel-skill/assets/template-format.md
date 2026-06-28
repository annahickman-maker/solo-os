# Template format

Each file in `{brand-vault}/Channel - Instagram/brand-templates/templates/` is one slide template. Self-contained HTML fragment that gets concatenated into `slides.html` at carousel-generation time.

## File naming

`{type}-{variant}.html` - kebab-case. Examples:
- `hook-1.html`, `hook-2.html`
- `statement-1.html`
- `list-numbered.html`, `list-bulleted.html`
- `cta-dark.html`, `cta-light.html`

Template type must match the slide types in `REFERENCE.md`. Variant is freeform.

## File structure

Three parts in order:

1. **Meta header** - YAML between `<!-- @template ... @end -->`
2. **Style block** - scoped via the slide's class
3. **Markup** - exactly one `<article class="slide [type-class]">` element

## Example

```html
<!-- @template
type: hook
variant: 1
description: Cream background, large display headline with rust italic accent
slots:
  eyebrow: optional, mono uppercase line above headline
  headline: required, may include <em> tags for italic accent
  footer-left: optional, default "swipe"
@end -->

<style>
  .slide.hook-1 {
    background: var(--cream);
  }
  .slide.hook-1 .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 80px 120px;
  }
  .slide.hook-1 .eyebrow {
    font-family: var(--font-mono);
    font-size: 16px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 48px;
  }
  .slide.hook-1 .eyebrow::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .slide.hook-1 h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 96px;
    line-height: 1.04;
    margin: 0;
    color: var(--coal);
  }
  .slide.hook-1 h1 em {
    font-family: var(--font-body);
    font-style: italic;
    font-weight: 400;
    color: var(--accent);
  }
</style>

<article class="slide hook-1" id="slide-{{INDEX}}">
  <div class="body">
    <span class="eyebrow">{{EYEBROW}}</span>
    <h1>{{HEADLINE}}</h1>
  </div>
</article>
```

## Slot rules

- Slot tokens are `{{UPPERCASE_NAME}}` - letters, digits, underscores only.
- The renderer does plain text substitution. HTML in slot values is allowed.
- Required slots that are missing in the script error loudly.
- Optional slots default to empty string unless the meta header lists a default.
- `{{INDEX}}` is reserved - auto-set to the slide's 1-based index zero-padded to 2 digits.
- `{{TOTAL}}` is reserved - auto-set to total slide count zero-padded to 2 digits.

## CSS rules

- Use `var(--token)` from the brand tokens compiled by the page-shell. Available tokens come from `design-system.json.palette`, `type-scale`, and `spacing`.
- Always scope rules under `.slide.{type-{variant}}` to avoid bleeding into other slides.
- The slide root MUST have `width: 1080px; height: 1350px; overflow: hidden` - page-shell sets these but don't unset them.
- Use `position: relative` on the slide root if you absolutely position children.

## Markup rules

- Exactly one `<article class="slide {type-class}">` per file.
- The `id` must be `slide-{{INDEX}}` so the page-shell can reference it.
- No `<html>`, `<head>`, `<body>`, or `<script>` tags - the shell provides those.
- No external font imports inside the template - fonts come from the shell via design-system.json.

## Validation checklist

- [ ] Meta header present and correctly delimited
- [ ] Exactly one `<article class="slide ...">` element
- [ ] All slots use `{{UPPERCASE}}` syntax
- [ ] CSS scoped under `.slide.{class}`
- [ ] No hardcoded copy outside slot tokens
- [ ] Uses brand tokens (var(--coal), var(--accent), etc.) instead of hex values
- [ ] No em dashes (U+2014)
