import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SkillFull, type SkillWrite, type SkillInput } from '../api';
import { useSkillRun } from '../components/SkillRunProvider';
import { Icon, ICON_KINDS, ICON_COLOR, CATEGORY_COLOR, PlayIcon, type IconKind } from '../lib/skillVisuals';
import { Markdown } from '../lib/Markdown';

const CATEGORIES = ['Meta', 'Research', 'Ideas', 'Create', 'Strategy', 'Clients'];

// What a skill can ask you to select before it runs. Each becomes a picker in
// the pre-run selection panel (phase 2).
const INPUT_TYPES = ['transcript', 'offer', 'avatar', 'video', 'client', 'project', 'idea', 'pov', 'text'];
// Where a skill's result is saved when it finishes.
const OUTPUT_TYPES = ['inbox', 'project', 'transcript', 'content', 'tasks'];

type Form = SkillWrite;

const EMPTY: Form = {
  title: '',
  card: '',
  description: '',
  instructions: '',
  category: 'Create',
  inputs: [],
  outputs: [],
  icon: '',
  color: '',
  notes: '',
  knowledge: '',
};

function fromSkill(s: SkillFull): Form {
  return {
    title: s.title || s.name,
    card: s.card,
    description: s.description,
    instructions: s.instructions,
    category: s.category,
    inputs: s.inputs ?? [],
    outputs: s.outputs ?? [],
    icon: s.icon,
    color: s.color,
    notes: s.notes,
    knowledge: s.knowledge,
  };
}

export function SkillEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { runSkill } = useSkillRun();

  const { data: skill, isLoading } = useQuery({
    queryKey: ['skill', id],
    queryFn: () => api.getSkill(id!),
    enabled: !isNew,
  });

  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingInstructions, setEditingInstructions] = useState(false);

  useEffect(() => {
    if (skill) setForm(fromSkill(skill));
  }, [skill]);

  // Read-only when the server says it isn't editable (built-ins, unless the
  // ALLOW_BUILTIN_EDITS override is on). A built-in that IS editable shows a
  // gentle heads-up that edits change the members' template.
  const readOnly = skill ? skill.editable === false : false;
  const editingBuiltin = !!skill?.builtIn && !readOnly;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Picking an icon also sets its bound colour - they travel together.
  const pickIcon = (k: IconKind) => setForm((f) => ({ ...f, icon: k, color: ICON_COLOR[k] }));

  const save = async () => {
    if (!form.title.trim()) {
      setErr('give the skill a title first.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        const res = await api.createSkill(form);
        await qc.invalidateQueries({ queryKey: ['skills'] });
        navigate(`/skills/${res.id}`);
      } else {
        await api.updateSkill(id!, form);
        await qc.invalidateQueries({ queryKey: ['skills'] });
        await qc.invalidateQueries({ queryKey: ['skill', id] });
        navigate('/skills');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await api.duplicateSkill(id);
      await qc.invalidateQueries({ queryKey: ['skills'] });
      navigate(`/skills/${res.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const run = () => {
    if (skill) runSkill(skill.id);
  };

  if (!isNew && isLoading) return <div className="empty">loading</div>;

  const iconKind: IconKind = (ICON_KINDS.includes(form.icon as IconKind) ? form.icon : 'meta') as IconKind;
  const accent = form.color || (form.icon ? ICON_COLOR[iconKind] : CATEGORY_COLOR[form.category]) || 'var(--accent)';

  return (
    <div className="stack" style={{ gap: 'var(--space-5)', maxWidth: 820 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={() => navigate('/skills')} style={backBtn}>
          ← skills
        </button>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {!isNew && (
            <button type="button" onClick={run} style={runBtn}>
              <PlayIcon /> run skill
            </button>
          )}
          {readOnly ? (
            <button type="button" onClick={duplicate} disabled={saving} style={primaryBtn}>
              {saving ? '…' : 'duplicate to edit'}
            </button>
          ) : (
            <button type="button" onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? 'saving…' : isNew ? 'create' : 'save'}
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div style={banner}>
          <strong style={{ fontWeight: 600 }}>built-in starter - read-only.</strong>{' '}
          <span className="muted">you can't edit a starter directly. duplicate it to make an editable copy in your vault.</span>
        </div>
      )}
      {editingBuiltin && (
        <div style={banner}>
          <strong style={{ fontWeight: 600 }}>editing a built-in skill.</strong>{' '}
          <span className="muted">changes here update the version that ships in the members' template.</span>
        </div>
      )}
      {err && <div style={{ ...banner, color: 'var(--danger)', borderColor: 'var(--danger)' }}>{err}</div>}

      <Field label="Title" help="Shown as the skill name on cards and menus.">
        <input style={input} value={form.title} disabled={readOnly} onChange={(e) => set('title', e.target.value)} placeholder="Clip viral moments" />
      </Field>

      <Field label="Card preview" help="The friendly one-liner shown under the name on the Skills page.">
        <input style={input} value={form.card} disabled={readOnly} onChange={(e) => set('card', e.target.value)} placeholder="Turn rough ideas into polished threads" />
      </Field>

      <Field label="When to use" help={'The trigger Claude reads to auto-apply this skill. e.g. "Use when the user asks to write an X thread."'}>
        <input style={input} value={form.description} disabled={readOnly} onChange={(e) => set('description', e.target.value)} placeholder="Use when the user asks to..." />
      </Field>

      <Field label="Category" help="Groups this skill on the page.">
        <select style={input} value={form.category} disabled={readOnly} onChange={(e) => set('category', e.target.value)}>
          {(CATEGORIES.includes(form.category) ? CATEGORIES : [form.category, ...CATEGORIES]).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Inputs" help="What to select before this skill runs. Each becomes a picker in the run setup. Leave empty to run instantly.">
        <SelectorRows items={form.inputs} types={INPUT_TYPES} readOnly={readOnly} addLabel="+ add input" emptyNote="runs with no selection step." onChange={(v) => set('inputs', v)} />
      </Field>

      <Field label="Outputs" help="What this skill produces and where each piece goes. Add one box per output - the description is the instruction the run follows (e.g. summary → inbox; tasks → approve, then to the task list, linked to the selected client).">
        <SelectorRows
          items={form.outputs}
          types={OUTPUT_TYPES}
          readOnly={readOnly}
          addLabel="+ add output"
          emptyNote="no outputs defined."
          variant="output"
          descriptionPlaceholder="describe this output and where it goes - e.g. 'the approved tasks, added to the master task list and connected to the selected client'"
          onChange={(v) => set('outputs', v)}
        />
      </Field>

      <Field label="Appearance" help="Pick an icon - its colour comes with it.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              placeItems: 'center',
              color: accent,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            }}
          >
            <Icon kind={iconKind} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ICON_KINDS.map((k) => {
              const on = form.icon === k;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={readOnly}
                  onClick={() => pickIcon(k)}
                  title={k}
                  style={{
                    width: 36,
                    height: 36,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 'var(--radius-sm)',
                    color: ICON_COLOR[k],
                    background: on ? `color-mix(in srgb, ${ICON_COLOR[k]} 16%, transparent)` : 'transparent',
                    border: `1px solid ${on ? ICON_COLOR[k] : 'var(--hairline)'}`,
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  <Icon kind={k} size={17} />
                </button>
              );
            })}
          </div>
        </div>
      </Field>

      <Field label="Instructions" help="The instructions Claude follows when this skill runs.">
        {readOnly || !editingInstructions ? (
          <div>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                maxHeight: 460,
                overflowY: 'auto',
              }}
            >
              {form.instructions.trim() ? <Markdown text={form.instructions} /> : <span className="muted">no instructions yet.</span>}
            </div>
            {!readOnly && (
              <button type="button" onClick={() => setEditingInstructions(true)} style={textBtn}>
                edit instructions
              </button>
            )}
          </div>
        ) : (
          <div>
            <textarea
              style={{ ...input, minHeight: 280, resize: 'vertical', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 'var(--body-sm)', lineHeight: 1.55 }}
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              placeholder="You are a..."
            />
            <button type="button" onClick={() => setEditingInstructions(false)} style={textBtn}>
              done editing
            </button>
          </div>
        )}
      </Field>

      <Field label="Knowledge base" help="Vault files or folders this skill should read while it runs (one path per line).">
        <textarea
          style={{ ...input, minHeight: 80, resize: 'vertical', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 'var(--body-sm)' }}
          value={form.knowledge}
          disabled={readOnly}
          onChange={(e) => set('knowledge', e.target.value)}
          placeholder="01_Core/core_voice-style.md&#10;05_Assets/POVs/"
        />
      </Field>

      <Field label="Notes" help="Patterns and examples baked into the skill.">
        <textarea
          style={{ ...input, minHeight: 100, resize: 'vertical' }}
          value={form.notes}
          disabled={readOnly}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Patterns, what good looks like, references..."
        />
      </Field>

      <div style={{ height: 'var(--space-6)' }} />
    </div>
  );
}

// Shared list UI for Inputs and Outputs. Inputs are compact rows (type +
// multiple/optional). Outputs are boxes: a destination tag + a description that
// IS the instruction for what happens to that output at the end of the run.
function SelectorRows({
  items,
  types,
  readOnly,
  addLabel,
  emptyNote,
  variant = 'input',
  descriptionPlaceholder,
  onChange,
}: {
  items: SkillInput[];
  types: string[];
  readOnly: boolean;
  addLabel: string;
  emptyNote: string;
  variant?: 'input' | 'output';
  descriptionPlaceholder?: string;
  onChange: (next: SkillInput[]) => void;
}) {
  const add = () => onChange([...items, { type: types[0] }]);
  const update = (i: number, patch: Partial<SkillInput>) => onChange(items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const typeSelect = (it: SkillInput, i: number) => (
    <select
      value={it.type}
      disabled={readOnly}
      onChange={(e) => update(i, { type: e.target.value })}
      style={{ ...input, width: 'auto', minWidth: 130, padding: '6px 10px' }}
    >
      {(types.includes(it.type) ? types : [it.type, ...types]).map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );

  const removeBtn = (i: number) =>
    !readOnly ? (
      <button type="button" onClick={() => remove(i)} title="remove" style={{ color: 'var(--muted)', cursor: 'pointer', padding: '2px 6px' }}>
        ✕
      </button>
    ) : null;

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      {items.map((it, i) =>
        variant === 'output' ? (
          <div
            key={i}
            className="stack"
            style={{ gap: 8, padding: 'var(--space-3)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {typeSelect(it, i)}
              <span style={{ flex: 1 }} />
              {removeBtn(i)}
            </div>
            <textarea
              value={it.description ?? ''}
              disabled={readOnly}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder={descriptionPlaceholder}
              style={{ ...input, minHeight: 64, resize: 'vertical', padding: '8px 12px', fontSize: 'var(--body-sm)', lineHeight: 1.5 }}
            />
          </div>
        ) : (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 'var(--space-2) var(--space-3)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)' }}
          >
            {typeSelect(it, i)}
            <span style={{ flex: 1 }} />
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--body-sm)', cursor: readOnly ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={!!it.multiple} disabled={readOnly} onChange={(e) => update(i, { multiple: e.target.checked })} />
              multiple
            </label>
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--body-sm)', cursor: readOnly ? 'default' : 'pointer' }}>
              <input type="checkbox" checked={!!it.optional} disabled={readOnly} onChange={(e) => update(i, { optional: e.target.checked })} />
              optional
            </label>
            {removeBtn(i)}
          </div>
        ),
      )}
      {!readOnly && (
        <button type="button" onClick={add} style={{ ...chip(false), alignSelf: 'flex-start' }}>
          {addLabel}
        </button>
      )}
      {readOnly && items.length === 0 && <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>{emptyNote}</span>}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label style={{ fontSize: 'var(--body-sm)', fontWeight: 600 }}>{label}</label>
      {help && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.45 }}>
          {help}
        </span>
      )}
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}

const input: CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--ink)',
  padding: '10px 14px',
  fontSize: 'var(--body)',
  outline: 'none',
};

const backBtn: CSSProperties = {
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: 'var(--body-sm)',
  cursor: 'pointer',
  padding: '6px 4px',
};

const primaryBtn: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--bg)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 18px',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};

const runBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: '#EDEDE9',
  color: '#16140F',
  border: '1.5px solid #16140F',
  borderRadius: 'var(--radius-md)',
  padding: '8px 16px',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
};

const textBtn: CSSProperties = {
  marginTop: 8,
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: 'var(--body-sm)',
  cursor: 'pointer',
  textDecoration: 'underline',
};

const banner: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--fill-subtle)',
  fontSize: 'var(--body-sm)',
  lineHeight: 1.5,
};

function chip(on: boolean): CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--body-sm)',
    cursor: 'pointer',
    background: on ? 'var(--ink)' : 'var(--surface)',
    color: on ? 'var(--bg)' : 'var(--muted)',
    border: `1px solid ${on ? 'var(--ink)' : 'var(--hairline)'}`,
  };
}
