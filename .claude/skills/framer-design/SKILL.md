---
name: framer-design
description: Expert Framer design patterns for building websites via the Framer MCP. Use when assembling websites in Framer, building section components, applying brand styles, fixing layout issues, or working with the Framer XML API. Covers the token system, dark/light text handling, layout patterns, spacing scale, component architecture, and common pitfalls.
---

# Framer Design via MCP

This skill covers everything needed to build professional websites in Framer through the MCP connection. It encodes the patterns, pitfalls, and best practices learned from real builds.

## Core principle

Framer's MCP works through XML. You describe layouts as nested frames with attributes. Everything is either a Frame (container), Text (content), SVG, or ComponentInstance. Understanding how these map to visual output is the entire skill.

---

## The token system

### Color styles

Use semantic color style names, not raw values. This lets Claude update every color site-wide by changing one style.

**Required color styles (create these first in every project):**

| Style | Light | Dark | Purpose |
|---|---|---|---|
| /Ink | #0A0A0A | #F5F5F5 | Primary text, headings |
| /Ink Soft | #1A1A1A | #E5E5E5 | Body text |
| /Ink Mute | #666666 | #AAAAAA | Secondary text, captions |
| /Ink Faint | #999999 | #777777 | Placeholder, disabled |
| /Paper | #FAFAF7 | #0A0A0A | Page background |
| /Surface | #FFFFFF | #1A1A1A | Card/section backgrounds |
| /Rule | #E5E5E0 | #2A2A2A | Borders, dividers |
| /Accent | #0A0A0A | #F5F5F5 | Brand accent (overridden per client) |
| /On Dark | #FAFAF7 | #1A1A1A | Primary text on dark backgrounds |
| /On Dark Soft | #D4D4D0 | #444444 | Subheading text on dark backgrounds |
| /On Dark Mute | #AAAA9E | #666666 | Body text on dark backgrounds |
| /On Dark Faint | #88887E | #888888 | Labels/captions on dark backgrounds |

**Why "On Dark" styles exist:** Sections with `backgroundColor="/Ink"` flip in dark mode - the background becomes light. Text on those sections must also flip. The `/On Dark` color styles handle this automatically: light text in light mode (on dark bg), dark text in dark mode (on now-light bg). Raw rgba values like `rgba(250,250,247,0.6)` do NOT flip and will be invisible in one mode.

**Usage in XML:**
```xml
backgroundColor="/Paper"
borderColor="/Rule"
```

Never use raw hex values in section layouts. Always reference style paths. Never use raw rgba values for text colors - always use a color style that has both light and dark variants.

### Text styles

Text color in Framer is controlled by the text style, not by a separate color attribute. This means you need TWO versions of every text style - one for light backgrounds and one for dark backgrounds.

**Required text style pairs:**

| Light bg style | Dark bg style | Font | Size | Purpose |
|---|---|---|---|---|
| /Display XL | /Display XL Light | Fraunces 300 | 120px | Hero titles |
| /Display LG | /Display LG Light | Fraunces 300 | 80px | Section titles |
| /Display MD | /Display MD Light | Fraunces 400 | 56px | Subsection titles |
| /Heading | /Heading Light | Fraunces 400 | 28px | Card headings |
| /Heading SM | /Heading SM Light | Fraunces 400 | 22px | Small headings |
| /Subheading | /Subheading Light | Fraunces 300i | 22px | Lead text, italic |
| /Eyebrow | /Eyebrow Light | Inter 500 | 11px | Labels, uppercase |
| /Body LG | /Body LG Light | Inter 400 | 17px | Large body |
| /Body | /Body Light | Inter 400 | 15px | Default body |
| /Body SM | /Body SM Light | Inter 400 | 13px | Small body, captions |
| /Caption | - | Inter 400 | 11px | Metadata |
| /Button | - | Inter 500 | 13px | Button text (on dark bg) |
| /Button Outline | - | Inter 500 | 13px | Button text (on light bg) |
| /Nav Link | - | Inter 400 | 14px | Navigation links |
| /Quote | - | Fraunces 300 | 22px | Testimonial quotes |

**Critical rule:** When building a section with a dark background (backgroundColor="/Ink"), EVERY text node inside must use the "Light" variant of its text style. If you forget this, text will be invisible (dark on dark).

**Light style color references (NOT raw rgba - these flip in dark mode):**
- Headings (Display/Heading Light): color = `/On Dark`
- Subheadings (Subheading Light): color = `/On Dark Soft`
- Body text (Body/Body LG Light): color = `/On Dark Mute`
- Labels/captions (Eyebrow Light, Body SM Light): color = `/On Dark Faint`

**Dark mode behavior:** In dark mode, `/Ink` background becomes light (#F5F5F5). The `/On Dark` colors automatically flip to dark values, keeping text readable. This is why raw rgba values must never be used for text colors.

---

## Layout fundamentals

### The stack model

Framer uses `layout="stack"` for flexbox-like layouts. Every section is built from nested stacks.

```xml
<Section
    width="100%"
    height="fit-content"
    layout="stack"
    padding="128px 80px 128px 80px"
    stackDirection="vertical"
    stackDistribution="start"
    stackAlignment="start"
>
```

**Key attributes:**
- `stackDirection`: "horizontal" (row) or "vertical" (column)
- `stackDistribution`: "start", "center", "end", "space-between"
- `stackAlignment`: "start", "center", "end"
- `gap`: spacing between children (e.g. "24px")

### The grid model

For multi-column card layouts, use `layout="grid"`.

```xml
<Grid
    width="100%"
    height="fit-content"
    backgroundColor="/Rule"
    borderWidth="1px"
    borderStyle="solid"
    borderColor="/Rule"
    layout="grid"
    gap="1px"
    gridColumns="3"
    gridRowHeightType="auto"
>
    <Card backgroundColor="/Surface" padding="48px" />
    <Card backgroundColor="/Surface" padding="48px" />
    <Card backgroundColor="/Surface" padding="48px" />
</Grid>
```

**The 1px gap trick:** Set the grid's backgroundColor to the border color ("/Rule") and use gap="1px". Each card gets its own background. This creates the editorial hairline-border grid pattern without actual borders on each card.

### Spacing scale

Use these values consistently. Never use arbitrary numbers.

| Token | Value | Use |
|---|---|---|
| space-1 | 4px | Tight internal gaps |
| space-2 | 8px | Small gaps (footer links, form labels) |
| space-3 | 16px | Component gaps (text style gap, card internal) |
| space-4 | 24px | Standard gap between elements |
| space-5 | 32px | Medium gap |
| space-6 | 48px | Section internal padding, card padding |
| space-7 | 64px | Between header and content |
| space-8 | 96px | Between major sections |
| space-9 | 128px | Section top/bottom padding |
| space-10 | 192px | Hero/CTA breathing room |

**Standard section padding:** `padding="128px 80px 128px 80px"` (top right bottom left)
**Standard gap between header and content:** `gap="64px"`

---

## Common pitfalls

### 1. Framer auto-assigns white backgrounds (THE BIGGEST GOTCHA)

When you create a new Frame via MCP, Framer sets `backgroundColor="rgba(255,255,255,1)"` by default on EVERY frame. This causes two problems:
- On dark sections: white boxes appear around content groups
- On Paper-bg sections: the warm off-white (#FAFAF7) gets covered by cold pure white (#FFFFFF)

**Fix:** After building any section, set `backgroundColor="rgba(0,0,0,0)"` on EVERY child frame that doesn't need its own background. The only frames that should keep a background are:
- Section wrappers that intentionally use `/Ink`, `/Surface`, or `/Paper`
- Card elements inside grids (these need `/Paper` or `/Surface` to work with the 1px-gap trick)
- Image placeholder frames (use `/Rule`)
- Button frames (use `/Ink` or transparent with border)

**Systematic cleanup:** After building a page, search for all nodes with `backgroundColor="rgba(255,255,255,1)"` and clear them. This is the single most common visual bug in Framer MCP builds.

### 2. Text color is style-bound

You cannot set text color independently of the text style. To change a text node's color, you must either:
- Change its `inlineTextStyle` to a style with the desired color
- Create a new text style with the color you want

**Wrong:** `<Text color="#FFFFFF">` (color attribute doesn't exist on Text)
**Right:** `<Text inlineTextStyle="/Body Light">` (use the Light variant)

### 3. The page gap trap

When setting up a page's Desktop breakpoint, Framer defaults to `gap="10px"` on stacks. For a page where sections stack vertically with their own padding, set `gap="0px"` on the root Desktop frame.

### 4. Width: 1fr vs 100%

- Use `width="1fr"` for children of stack/grid parents that should fill available space
- Use `width="100%"` for the outermost section containers
- Use `width="fit-content"` for text and buttons that should size to content

### 5. Border patterns

Framer supports per-side borders:
```xml
borderWidth="1px 0px 0px 0px"  <!-- top only -->
borderWidth="0px 0px 1px 0px"  <!-- bottom only -->
borderWidth="1px 0px 1px 0px"  <!-- top and bottom -->
```

For editorial hairline dividers between sections, use `borderColor="/Rule"`.
For strong dividers (footer top), use `borderColor="/Ink"`.

### 6. Font selectors

Framer Google Fonts use this format: `GF;FontName-weight`

Common ones:
- `GF;Fraunces-300` (light serif display)
- `GF;Fraunces-regular` (regular serif)
- `GF;Fraunces-300italic` (italic serif for subheadings)
- `GF;Inter-regular` (body text)
- `GF;Inter-500` (medium for buttons, labels)
- `GF;Inter-600` (semibold for emphasis)

### 7. Image placeholders

For image slots in a template, create a Frame with:
```xml
<ImageSlot
    width="100%"
    height="500px"
    backgroundColor="/Rule"
    overflow="hidden"
    layout="stack"
    stackDirection="vertical"
    stackDistribution="center"
    stackAlignment="center"
>
    <Label inlineTextStyle="/Caption">Hero image - 16:7</Label>
</ImageSlot>
```

Use the Rule color for placeholder backgrounds - it's neutral and indicates "content goes here" without being harsh.

---

## Section architecture patterns

### Standard section wrapper

Every section follows this pattern:

```xml
<SectionName
    width="100%"
    height="fit-content"
    overflow="hidden"
    layout="stack"
    gap="64px"
    padding="128px 80px 128px 80px"
    stackDirection="vertical"
    stackDistribution="start"
    stackAlignment="start"
>
    <Header>
        <Eyebrow inlineTextStyle="/Eyebrow">SECTION LABEL</Eyebrow>
        <Title inlineTextStyle="/Display MD">Section title</Title>
    </Header>
    <Content>
        <!-- section-specific content -->
    </Content>
</SectionName>
```

### Two-column editorial (text + image)

```xml
<Section
    layout="stack"
    gap="96px"
    padding="128px 80px 128px 80px"
    stackDirection="horizontal"
    stackDistribution="start"
    stackAlignment="center"
>
    <TextCol width="1fr" layout="stack" gap="24px" stackDirection="vertical">
        <!-- eyebrow, title, body, CTA -->
    </TextCol>
    <ImageCol width="1fr" height="600px" backgroundColor="/Rule">
        <!-- image placeholder -->
    </ImageCol>
</Section>
```

### Card grid (offers, pricing, process)

```xml
<Grid
    backgroundColor="/Rule"
    borderWidth="1px"
    borderStyle="solid"
    borderColor="/Rule"
    layout="grid"
    gap="1px"
    gridColumns="3"
    gridRowHeightType="auto"
>
    <Card backgroundColor="/Paper" padding="48px" layout="stack" gap="16px" stackDirection="vertical" />
    <Card backgroundColor="/Paper" padding="48px" layout="stack" gap="16px" stackDirection="vertical" />
    <Card backgroundColor="/Paper" padding="48px" layout="stack" gap="16px" stackDirection="vertical" />
</Grid>
```

### Two-column FAQ layout

```xml
<FAQs
    layout="stack"
    gap="96px"
    stackDirection="horizontal"
    stackDistribution="start"
    stackAlignment="start"
>
    <Header width="400px">
        <!-- eyebrow + title stacked left -->
    </Header>
    <FAQList width="1fr" layout="stack" gap="0px" stackDirection="vertical">
        <FAQItem borderWidth="1px 0px 1px 0px" borderColor="/Rule" padding="24px 0px">
            <Question inlineTextStyle="/Heading SM" />
            <Answer inlineTextStyle="/Body SM" />
        </FAQItem>
        <!-- more items, only bottom border after first -->
    </FAQList>
</FAQs>
```

### Dark section pattern

```xml
<DarkSection
    width="100%"
    backgroundColor="/Ink"
    padding="128px 80px 128px 80px"
>
    <!-- ALL child frames: backgroundColor="rgba(0,0,0,0)" -->
    <!-- ALL text nodes: use "Light" text style variants -->
    <!-- Borders: use "rgba(250, 250, 247, 0.12)" instead of /Rule -->
    <Eyebrow inlineTextStyle="/Eyebrow Light" />
    <Title inlineTextStyle="/Display MD Light" />
    <Body inlineTextStyle="/Body LG Light" />
</DarkSection>
```

---

## Brand application workflow

When applying a brand to the template, update in this order:

1. **Color styles** - update /Ink, /Paper, /Surface, /Accent, /Rule values
2. **Text style fonts** - swap Fraunces/Inter for the client's serif/sans pair
3. **Text style Light variants** - update colors to use the new /Paper value
4. **Section content** - replace placeholder text with copy from the copy workflows
5. **Images** - set backgroundImage on placeholder frames

**Key principle:** Because everything references styles, changing one style cascades everywhere. Update the style definitions, not individual nodes.

---

## Button patterns

### Solid button (primary CTA)

```xml
<Button
    width="fit-content"
    height="fit-content"
    backgroundColor="/Ink"
    overflow="hidden"
    layout="stack"
    padding="14px 32px 14px 32px"
    stackDirection="horizontal"
    stackDistribution="center"
    stackAlignment="center"
>
    <ButtonText inlineTextStyle="/Button">GET STARTED</ButtonText>
</Button>
```

### Outline button (secondary CTA)

```xml
<Button
    width="fit-content"
    height="fit-content"
    backgroundColor="rgba(0,0,0,0)"
    borderWidth="1px"
    borderStyle="solid"
    borderColor="/Ink"
    overflow="hidden"
    layout="stack"
    padding="14px 32px 14px 32px"
    stackDirection="horizontal"
    stackDistribution="center"
    stackAlignment="center"
>
    <ButtonText inlineTextStyle="/Button Outline">LEARN MORE</ButtonText>
</Button>
```

### Button on dark background

```xml
<Button backgroundColor="/Paper" padding="14px 32px 14px 32px">
    <ButtonText inlineTextStyle="/Button Outline">GET STARTED</ButtonText>
</Button>
```

---

## Navigation pattern

```xml
<Nav
    width="100%"
    height="72px"
    backgroundColor="/Paper"
    borderWidth="0px 0px 1px 0px"
    borderStyle="solid"
    borderColor="/Rule"
    overflow="hidden"
    layout="stack"
    padding="0px 80px 0px 80px"
    stackDirection="horizontal"
    stackDistribution="space-between"
    stackAlignment="center"
>
    <Logo inlineTextStyle="/Heading SM">Brand</Logo>
    <Links layout="stack" gap="48px" stackDirection="horizontal" stackAlignment="center">
        <Link inlineTextStyle="/Nav Link">About</Link>
        <Link inlineTextStyle="/Nav Link">Services</Link>
        <Link inlineTextStyle="/Nav Link">Work</Link>
        <Link inlineTextStyle="/Nav Link">Contact</Link>
    </Links>
    <CTA backgroundColor="/Ink" padding="10px 24px">
        <CTAText inlineTextStyle="/Button">GET STARTED</CTAText>
    </CTA>
</Nav>
```

---

## Footer pattern

```xml
<Footer
    width="100%"
    borderWidth="1px 0px 0px 0px"
    borderColor="/Ink"
    padding="96px 80px 64px 80px"
    layout="stack"
    gap="64px"
    stackDirection="vertical"
>
    <TopRow layout="stack" gap="64px" stackDirection="horizontal" borderWidth="0px 0px 1px 0px" borderColor="/Rule" padding="0px 0px 64px 0px">
        <Brand width="2fr"><!-- logo + tagline --></Brand>
        <Col width="1fr"><!-- Pages links --></Col>
        <Col width="1fr"><!-- Connect links --></Col>
        <Col width="1fr"><!-- Legal links --></Col>
    </TopRow>
    <BottomRow layout="stack" stackDirection="horizontal" stackDistribution="space-between">
        <Copyright inlineTextStyle="/Caption" />
        <Socials layout="stack" gap="24px" stackDirection="horizontal" />
    </BottomRow>
</Footer>
```

---

## Checklist before delivering a site

- [ ] Page Desktop frame has gap="0px" (no unwanted spacing between sections)
- [ ] All dark sections have transparent child backgrounds
- [ ] All dark sections use Light text style variants
- [ ] All borders use /Rule or /Ink color styles (not raw values)
- [ ] All backgrounds use /Paper or /Surface (not raw white)
- [ ] All text uses text styles (not raw font attributes)
- [ ] Image placeholders use /Rule background with /Caption labels
- [ ] Buttons use /Ink bg + /Button text OR transparent bg + /Ink border + /Button Outline text
- [ ] Section padding is consistent (128px 80px standard)
- [ ] No arbitrary spacing values outside the scale
