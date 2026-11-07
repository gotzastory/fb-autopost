import type { Group, Identity } from './types';

const BAD_NAME =
  /^(groups|see all|your groups|discover|your feed|groups you manage|groups you've joined|groups you’ve joined|create new group|facebook groups|view group|see group|group|public group|joined|join|leave|members?|posts?|you|your content|facebook user|посмотреть группу|просмотреть группу|открыть группу|группа|عرض المجموعة|مشاهدة المجموعة|رؤية المجموعة|المجموعة|ver grupo|voir le groupe|xem nhóm|nhóm)$/iu;
const DATE_ONLY = /^(sun|mon|tue|wed|thu|fri|sat)\w*,?\s+.+\d{4}(?:\s+at\s+.+)?$/i;
const NON_PAGE_NAME =
  /^(?:chat(?:\s+history(?:\s+is\s+missing)?)?|chat\s+history|invitations?(?:\s+\d+\s+(?:new|pending))?|invites?(?:\s+\d+\s+(?:new|pending))?|messages?(?:\s+\d+)?|notifications?(?:\s+\d+)?|messenger|advertise|advertising|advertisement|live video|photo\/?video|reel|dashboard|edit profile|report a problem|create post|promote|switch now|switch back|activate|pages?|pages you manage|see all pages|see all profiles|home|marketplace|settings|log out)$/i;
const NON_PAGE_PREFIX = /^(?:chat\s+history|invitations?|invites?|messages?|notifications?)\b/i;

export function cleanName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(?:you\s+)?(?:last\s+)?visited\s+.+$/i, '')
    .replace(/\s+last active\s+.+$/i, '')
    .replace(/\s+tagged everyone.*$/i, '')
    .replace(/\s+\d+\s+(?:new\s+)?(?:posts?|messages?|notifications?)\s*$/i, '')
    .replace(/\s+(?:a few\s+)?(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\s*$/i, '')
    .replace(/\s+\d+\s*(?:members?|posts?)\s*$/i, '')
    .trim();
}

export function isValidGroupName(value: unknown): boolean {
  const s = cleanName(value);
  return (
    s.length >= 2 && s.length <= 160 && !BAD_NAME.test(s) && !DATE_ONLY.test(s) && !/^[\d.,]+\s*(members?|posts?)$/i.test(s)
  );
}

/** A group's name is only shown once it is a real name, not its numeric id. */
export function hasDisplayName(group: Group): boolean {
  const name = String(group.name ?? '').trim();
  return isValidGroupName(name) && !(/^\d+$/.test(name) && name === String(group.id));
}

type RawGroup = Partial<Group> & { groupId?: string; group_id?: string };

export function normalizeGroups(list: unknown): Group[] {
  const byId = new Map<string, Group>();
  for (const raw of (Array.isArray(list) ? list : []) as RawGroup[]) {
    const id = String(raw?.id || raw?.groupId || raw?.group_id || '').trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) continue;
    const old = byId.get(id);
    byId.set(id, {
      ...old,
      ...raw,
      id,
      name: cleanName(raw.name),
      url: raw.url || old?.url || `https://www.facebook.com/groups/${id}/`,
    });
  }
  return [...byId.values()];
}

export function isManualGroupUrl(value: string): boolean {
  return /^https?:\/\/(?:www\.)?facebook\.com\/groups\/[A-Za-z0-9._-]+\/?(?:[?#].*)?$/i.test(value.trim());
}

export function isFacebookAssetUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    return protocol === 'https:' && /(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/i.test(hostname);
  } catch {
    return false;
  }
}

export function cleanPageName(value: unknown): string {
  let name = String(value ?? '').replace(/\s+/g, ' ').trim();
  const trailing = [
    /\s+(?:\d+\s+)?notifications?\b.*$/i,
    /\s+(?:\d+\s+)?messages?\b.*$/i,
    /\s+(?:create\s+post|promote)\b.*$/i,
    /\s+(?:switch\s*now|switch\s*back|activate)\b.*$/i,
  ];
  for (const re of trailing) {
    const m = name.match(re);
    if (m && m.index! > 1) name = name.slice(0, m.index).trim();
  }
  return name.replace(/^[/•·▪◦\-–—_]+\s*/, '').trim();
}

/** Drops Facebook UI labels that the Page scraper can pick up as Page names. */
export function cleanPages(list: unknown): Identity[] {
  return ((Array.isArray(list) ? list : []) as Partial<Identity>[])
    .filter((p) => {
      const raw = String(p?.name ?? '').replace(/\s+/g, ' ').trim();
      return raw && !NON_PAGE_PREFIX.test(raw);
    })
    .map((p) => ({ ...p, type: 'page' as const, name: cleanPageName(p.name) }))
    .filter((p) => p.name && !NON_PAGE_NAME.test(p.name));
}

export function groupsToCsv(groups: Group[]): string {
  const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['ID', 'Name', 'URL', 'Avatar'], ...groups.map((g) => [g.id, g.name, g.url, g.avatar ?? ''])];
  return '﻿' + rows.map((r) => r.map(quote).join(',')).join('\r\n');
}
