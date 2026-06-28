---
name: seo-aio-optimisation
description: Search engine and AI Overview optimisation for all web content. Auto-loads when writing website copy, generating meta tags, creating blog posts, writing headings, or structuring content for search visibility. Covers on-page SEO, technical SEO, AI Overview Optimisation (AIO - how Google AI Overviews and LLMs like ChatGPT reference and recommend websites), structured data, entity optimisation, and pre-launch auditing.
category: Create
hidden: true
---

# SEO and AIO Optimisation

This skill teaches Claude to write content that's optimised for search engines AND AI Overviews (Google's AI summaries, ChatGPT citations, Perplexity references) from the moment it's generated, not as a separate audit pass.

Auto-loads whenever Claude is working on web content so every copy generation is SEO-aware by default. A separate workflow (`workflow_seo-aio-pass.md`) still exists for dedicated final audits, but the baseline quality of generated copy should already be strong because this skill applies throughout.

---

## Core principle

SEO and AIO aren't things you add to content after writing it. They're principles that shape how content is structured from the first sentence. Good content written well is 80% of SEO. The remaining 20% is technical optimisation.

---

## On-Page SEO

### Meta Titles
- Uses primary keyword near the beginning
- Between 50-60 characters
- Compelling and accurately describes page content
- Unique meta title for each page
- Includes brand name where appropriate

### Meta Descriptions
- 150-160 characters
- Uses primary keyword naturally
- Gives an accurate and compelling description of the page
- Includes a clear call to action
- Unique description for each page

### Headers
- One H1 per page containing the primary keyword
- One H2 per section using secondary keywords
- Proper hierarchy (H3, H4 etc) within sections
- Headers describe the content that follows - no vague headings
- Headers read as a scannable outline of the page

### Content
- Primary keyword appears in the first 100 words
- Keywords used naturally throughout - not forced or stuffed
- Content directly answers the questions your audience is searching
- Minimum 300 words per page (more for sales pages and service pages)
- Short paragraphs - 2-3 sentences max
- Bullet points and lists for scannable information
- Bold key phrases and benefits for scanning
- Internal links to related pages on the site
- One clear CTA per section

### Images
- Descriptive alt text on every image (what the image shows, not keyword stuffing)
- File names use relevant keywords with hyphens (e.g. web-design-portfolio.jpg)
- Images compressed and optimised (tinyjpg.com)
- Max width 2400px, reasonable file size
- WebP format where supported

### URLs
- Short, clean, and descriptive
- Use primary keyword
- Hyphens between words
- No special characters, numbers, or parameter strings
- Lowercase only

---

## Technical SEO

### Performance
- Page load speed under 3 seconds (test with PageSpeed Insights)
- Core Web Vitals passing (LCP, FID, CLS)
- No render-blocking resources
- Lazy loading on images below the fold
- No broken links or 404 errors

### Mobile
- Fully responsive on all breakpoints
- Text readable without zooming
- Tap targets large enough (min 48px)
- No horizontal scrolling
- Test on real devices - not just browser preview

### Indexing
- XML sitemap generated and submitted to Google Search Console
- Robots.txt not blocking important pages
- No accidental noindex tags on pages you want found
- Canonical URLs set correctly (no duplicate content)
- Google Search Console connected and verified

### Structured Data
- Schema markup added for business type (LocalBusiness, Organization, etc.)
- FAQ schema on pages with FAQs (helps AI Overviews pull your answers)
- HowTo schema on process/step pages
- Review/testimonial schema where applicable
- Test with Google Rich Results Test

### Security
- SSL certificate active (HTTPS)
- No mixed content warnings
- Cookie banner installed and compliant

---

## AI Overview Optimisation (AIO)

Google AI Overviews and LLMs pull from websites that are structured clearly, answer questions directly, and demonstrate authority. These principles make it more likely content gets cited.

### Content Structure for AI
- Use question-based H2s that match what people actually search (e.g. "How does web design help my business?" not "Our approach")
- Answer each question directly in the first 1-2 sentences below the heading - then expand
- Use definition-style sentences for key terms (e.g. "A brand strategy is a document that outlines...")
- Include "what, who, how, why" framing throughout the site
- Lists and numbered steps are heavily favoured by AI summaries - use them

### Authority Signals
- About page includes real credentials, experience, and specific results
- Testimonials include full names and businesses where possible
- Case studies include specific numbers and outcomes
- Author/business name appears consistently across the site
- Links to and from reputable external sources (press, publications, directories)

### Entity Optimisation
- Business name, location, and service type mentioned consistently
- Google Business Profile complete and up to date
- Business listed in relevant directories (industry-specific + general like Yelp, Clutch, etc.)
- Social profiles linked and active
- Consistent NAP (Name, Address, Phone) across all listings

### Content that AI Cites
- Original insights and frameworks - not generic advice rewritten
- Specific data points, numbers, and results from real work
- Comparison content (e.g. "X vs Y" or "how to choose between...")
- Process breakdowns with clear steps
- FAQ sections that directly answer common questions in 2-3 sentences each

### Topical Authority
- Site covers the client's core topic thoroughly - not one page, but multiple supporting pages
- Blog or resource pages that go deeper on specific aspects of the main service
- Internal linking creates clear topic clusters (main service page links to related deeper pages)
- Content updated regularly - not a static site that never changes

---

## How to apply this skill while writing

When generating any website copy, apply these as you go (not as an afterthought):

### Writing headlines
- Make them question-based where possible (better for AIO)
- Include the primary keyword naturally
- Write for humans first, but think about what search queries would bring someone to this section

### Writing body paragraphs
- Front-load the answer in the first sentence (inverted pyramid)
- Keep paragraphs short (2-3 sentences)
- Use bullet points when listing things
- Bold key phrases for scanners

### Writing headings
- Secondary keyword in H2s
- Hierarchy must be clean (H1 > H2 > H3, no skipping)
- Headings should tell the story of the page even if body is hidden

### Writing meta descriptions (during page creation)
- Don't wait until launch - write them when generating the page
- 150-160 characters
- Primary keyword + CTA

### Writing image references
- When mentioning an image in copy, specify alt text simultaneously
- Make alt text descriptive, not keyword-stuffed

---

## Pre-Launch Final Check

A separate `workflow_seo-aio-pass.md` handles the comprehensive pre-launch audit. That workflow runs this full checklist:

- Run full site through Google PageSpeed Insights
- Run full site through Google Rich Results Test
- Check all pages in Google Search Console after indexing
- Test site search for client's primary keywords after 2-4 weeks
- Set up Google Analytics and conversion tracking
- Verify all legal pages are linked and accessible

The difference: the workflow is explicit (user-triggered, final audit). The skill is implicit (auto-applied during generation).

---

## When to apply this skill

Auto-load when Claude is:
- Writing homepage copy
- Writing about, services, sales pages
- Writing blog posts or articles
- Writing product descriptions (ecommerce)
- Generating meta titles or descriptions
- Creating sitemaps (for page structure impact)
- Reviewing copy for SEO quality
- Any content task where search visibility matters

Don't override this skill unless the task explicitly doesn't need SEO (e.g. internal documents, private emails).
