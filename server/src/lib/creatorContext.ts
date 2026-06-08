/**
 * Creator context loader.
 *
 * Reads everything the AI features need to know about the person using the
 * dashboard - name, positioning, voice style, story, POVs - from the vault.
 * Lets every AI lib file produce prompts that are personal to the creator
 * without hardcoding anyone's specifics.
 *
 * Three sources, in priority order:
 *   1. 00_System/state.md frontmatter (slot_* fields populated by onboarding)
 *   2. 01_Core/core_*.md files (voice, story, IP, etc.)
 *   3. Sensible blanks if neither exists
 *
 * Callers should `import { loadCreatorContext } from '../lib/creatorContext.js'`
 * and use the returned `name`, `positioning`, `voiceStyle`, etc. directly in
 * their system prompts.
 */

import { loadFile, abs } from '../vault.js';

export type CreatorContext = {
  /** Display name - first name preferred. Empty string if unknown. */
  name: string;
  /** Possessive form: "Tharros's" or "Anna's". "the creator's" if blank. */
  possessive: string;
  /** How to refer to them in third-person prose. "the creator" if blank. */
  thirdPerson: string;
  /** One-line positioning statement from onboarding. */
  positioningStatement: string;
  /** Who they help. */
  whoTheyHelp: string;
  /** Before-state of the audience. */
  beforeState: string;
  /** After-state of the audience. */
  afterState: string;
  /** Transformation summary. */
  transformation: string;
  /** Named mechanism / method (e.g. "Solopreneur OS"). */
  namedMechanism: string;
  /** 5-step (or N-step) method, ordered. */
  methodSteps: string[];
  /** Common enemy / villain framing. */
  commonEnemy: string;
  /** Compressed story summary. */
  compressedStory: string;
  /** Top 3 POV flips - the contrarian one-liners. */
  povFlips: string[];
  /** Full voice-style guide content (from core_voice-style.md body). */
  voiceStyleGuide: string;
  /** Story chapters (from core_my-story.md body). */
  storyDoc: string;
  /** Channel handle, e.g. "@theannahickman". Blank if unset. */
  channelHandle: string;
};

function readSlot(slots: Record<string, unknown>, key: string): string {
  const v = slots[key];
  return typeof v === 'string' ? v.trim() : '';
}

function firstName(full: string): string {
  return full.split(/\s+/)[0] ?? '';
}

function possessiveOf(name: string): string {
  if (!name) return "the creator's";
  if (name.toLowerCase().endsWith('s')) return `${name}'`;
  return `${name}'s`;
}

function readCoreBody(filename: string): string {
  const entry = loadFile(abs('01_Core', filename));
  return entry?.body?.trim() ?? '';
}

export function loadCreatorContext(): CreatorContext {
  const state = loadFile<Record<string, unknown>>(abs('00_System', 'state.md'));
  const fm = (state?.frontmatter ?? {}) as Record<string, unknown>;

  const name =
    readSlot(fm, 'creator_name') ||
    firstName(readSlot(fm, 'slot_compressed_story')) // very weak fallback - usually blank
      ? ''
      : '';

  const finalName = readSlot(fm, 'creator_name');
  const possessive = possessiveOf(finalName);
  const thirdPerson = finalName || 'the creator';

  const methodSteps = [
    readSlot(fm, 'slot_value_step_1'),
    readSlot(fm, 'slot_value_step_2'),
    readSlot(fm, 'slot_value_step_3'),
    readSlot(fm, 'slot_value_step_4'),
    readSlot(fm, 'slot_value_step_5'),
  ].filter(Boolean);

  const povFlips = [
    readSlot(fm, 'slot_pov_1_flip'),
    readSlot(fm, 'slot_pov_2_flip'),
    readSlot(fm, 'slot_pov_3_flip'),
  ].filter(Boolean);

  return {
    name: finalName,
    possessive,
    thirdPerson,
    positioningStatement: readSlot(fm, 'slot_positioning_statement'),
    whoTheyHelp: readSlot(fm, 'slot_who_you_help'),
    beforeState: readSlot(fm, 'slot_before_state'),
    afterState: readSlot(fm, 'slot_after_state'),
    transformation:
      readSlot(fm, 'slot_transformation_statement') ||
      readSlot(fm, 'slot_transformation_result'),
    namedMechanism: readSlot(fm, 'slot_core_named_mechanism'),
    methodSteps,
    commonEnemy: readSlot(fm, 'slot_common_enemy'),
    compressedStory: readSlot(fm, 'slot_compressed_story'),
    povFlips,
    voiceStyleGuide: readCoreBody('core_voice-style.md'),
    storyDoc: readCoreBody('core_my-story.md'),
    channelHandle: readSlot(fm, 'yt_channel_handle'),
  };
}

/**
 * Build a positioning prompt block for AI system prompts. Returns a generic
 * fallback if the creator hasn't completed onboarding yet.
 */
export function buildPositioningBlock(ctx: CreatorContext): string {
  if (!ctx.positioningStatement && !ctx.whoTheyHelp) {
    return `
CREATOR POSITIONING

(Onboarding not complete. Generate output in a calm, honest, direct voice. No hype, no guru language. Lowercase. Avoid "ultimate", "secrets", "you won't believe".)
`.trim();
  }

  const lines: string[] = [`CREATOR POSITIONING`, ''];
  if (ctx.name) lines.push(`CREATOR: ${ctx.name}`);
  if (ctx.channelHandle) lines.push(`CHANNEL: ${ctx.channelHandle}`);
  lines.push('');
  if (ctx.positioningStatement) lines.push(`POSITIONING: ${ctx.positioningStatement}`, '');
  if (ctx.whoTheyHelp) lines.push(`WHO IT'S FOR: ${ctx.whoTheyHelp}`, '');
  if (ctx.beforeState) lines.push(`BEFORE: ${ctx.beforeState}`, '');
  if (ctx.afterState) lines.push(`AFTER: ${ctx.afterState}`, '');
  if (ctx.transformation) lines.push(`TRANSFORMATION: ${ctx.transformation}`, '');
  if (ctx.namedMechanism) lines.push(`NAMED MECHANISM: ${ctx.namedMechanism}`, '');
  if (ctx.methodSteps.length) {
    lines.push(`METHOD:`);
    ctx.methodSteps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    lines.push('');
  }
  if (ctx.povFlips.length) {
    lines.push(`KEY POVS (the contrarian flips ${ctx.possessive} content runs on):`);
    ctx.povFlips.forEach((p) => lines.push(`  - ${p}`));
    lines.push('');
  }
  if (ctx.commonEnemy) lines.push(`COMMON ENEMY: ${ctx.commonEnemy}`, '');

  return lines.join('\n').trim();
}

/**
 * Build a voice-style block for AI system prompts. Returns blank if no voice
 * style file exists - prompt can then fall back to generic voice rules.
 */
export function buildVoiceStyleBlock(ctx: CreatorContext): string {
  if (!ctx.voiceStyleGuide) return '';
  return `
VOICE STYLE (how ${ctx.thirdPerson} writes / speaks - match this exactly)

${ctx.voiceStyleGuide.slice(0, 4000)}
`.trim();
}

/**
 * Wrap any existing system prompt with a creator-context preamble.
 *
 * Drop-in for legacy prompts that say "the creator", "she", "her" without
 * being template-built. The preamble tells Claude who "the creator" actually
 * is so output is grounded in that person's positioning, voice, and POVs.
 *
 * Idempotent: returns the prompt unchanged if no creator context is set
 * (template default / fresh install before onboarding).
 *
 * Usage:
 *   await callBridge(personalize(SYSTEM_PROMPT), userContent);
 */
export function personalize(prompt: string): string {
  const ctx = loadCreatorContext();
  if (!ctx.name && !ctx.positioningStatement && !ctx.whoTheyHelp) {
    return prompt;
  }

  const lines: string[] = [
    '═══════════════════════════════════════════════════════════',
    'WHO "THE CREATOR" IS',
    '═══════════════════════════════════════════════════════════',
  ];
  if (ctx.name) lines.push(`Name: ${ctx.name}`);
  if (ctx.channelHandle) lines.push(`Channel: ${ctx.channelHandle}`);
  if (ctx.positioningStatement) lines.push(`Positioning: ${ctx.positioningStatement}`);
  if (ctx.whoTheyHelp) lines.push(`Who they help: ${ctx.whoTheyHelp}`);
  if (ctx.transformation) lines.push(`Transformation they teach: ${ctx.transformation}`);
  if (ctx.namedMechanism) lines.push(`Named mechanism: ${ctx.namedMechanism}`);
  if (ctx.methodSteps.length) {
    lines.push('', 'Method:');
    ctx.methodSteps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }
  if (ctx.povFlips.length) {
    lines.push('', 'Key POVs (contrarian flips this person stands for):');
    ctx.povFlips.forEach((p) => lines.push(`  - ${p}`));
  }
  if (ctx.commonEnemy) lines.push('', `Common enemy: ${ctx.commonEnemy}`);
  if (ctx.compressedStory) lines.push('', `Story (compressed): ${ctx.compressedStory}`);
  if (ctx.voiceStyleGuide) {
    lines.push('', 'Voice style:', ctx.voiceStyleGuide.slice(0, 3000));
  }
  lines.push(
    '',
    `When the prompt below refers to "the creator", "she", "her", "he", "him", "they", or similar in the context of who the content belongs to, it refers to ${ctx.thirdPerson}. Output should be in ${ctx.possessive} voice and grounded in the positioning above.`,
    ''
  );

  return lines.join('\n') + '\n' + prompt;
}
