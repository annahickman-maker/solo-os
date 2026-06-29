import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SkillRow } from '../pages/Skills';

/**
 * Renders a single skill as a Skills-page-style card (icon, title, card line,
 * built-in/custom badge, working "run skill" button), found by its frontmatter
 * `name`. Drop it on any page to surface the right skill in context - e.g. the
 * offer-blueprint skill on the Offer Suite, the reel-scripter on Instagram.
 *
 * Renders nothing if the skill isn't installed, so it's safe to place
 * unconditionally. The schedule pill is hidden (these are run-in-context, not
 * scheduled from here).
 */
export function PageSkillLink({ name }: { name: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['skills'], queryFn: api.skills });
  const skill = data?.items.find((s) => s.name === name);
  if (!skill) return null;
  return <SkillRow skill={skill} onOpen={() => navigate(`/skills/${skill.id}`)} hideSchedule />;
}
