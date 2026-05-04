// smelt picker와 confirm 단계가 쓰는 순수 함수 모음(ADR 0031).
// catalog의 worlds/bundles/blocks 관계를 매핑해 picker 그룹화와 confirm lookup에 쓴다.
// I/O 없음. 데이터 무관(특정 도메인 ID 가정 금지, CLAUDE.md 섹션 8).

const ORPHAN_WORLD = { id: 'w-other', title: '기타' };
const ORPHAN_BUNDLE = null; // bundle 없는 블럭은 world 직속

// 카탈로그를 worlds → bundles → blocks 두 단계 구조로 정리한다.
// world.order가 있으면 그 순서를 따르고, 없으면 catalog.worlds의 등장 순서.
// bundle도 catalog.bundles의 등장 순서를 보존한다.
//
// 입력: catalog (catalog.schema.json 모양)
// 반환: [
//   {
//     world: { id, title } | ORPHAN_WORLD,
//     groups: [
//       { bundle: { id, title } | null, blocks: [block, ...] },
//       ...
//     ],
//   },
//   ...
// ]
//
// worlds가 비어있으면 모든 블럭을 ORPHAN_WORLD 한 그룹으로 폴백.
// 블럭의 bundle_id가 catalog.bundles에 없거나 bundle.world_id가 catalog.worlds에 없으면 ORPHAN으로.
export function buildBlockHierarchy(catalog) {
  const worlds = Array.isArray(catalog?.worlds) ? catalog.worlds : [];
  const bundles = Array.isArray(catalog?.bundles) ? catalog.bundles : [];
  const blocks = Array.isArray(catalog?.blocks) ? catalog.blocks : [];

  const bundleById = new Map();
  for (const b of bundles) {
    if (b && typeof b.id === 'string') bundleById.set(b.id, b);
  }
  const worldById = new Map();
  for (const w of worlds) {
    if (w && typeof w.id === 'string') worldById.set(w.id, w);
  }

  // worldId → bundleId(또는 'orphan-bundle') → blocks[] 누적
  const result = new Map(); // worldId → { world, bundleOrder: [], byBundle: Map }
  const ensureWorld = (world) => {
    const wid = world.id;
    if (!result.has(wid)) {
      result.set(wid, { world, bundleOrder: [], byBundle: new Map() });
    }
    return result.get(wid);
  };
  const addBlock = (worldEntry, bundleKey, bundleObj, block) => {
    if (!worldEntry.byBundle.has(bundleKey)) {
      worldEntry.bundleOrder.push(bundleKey);
      worldEntry.byBundle.set(bundleKey, { bundle: bundleObj, blocks: [] });
    }
    worldEntry.byBundle.get(bundleKey).blocks.push(block);
  };

  for (const block of blocks) {
    if (!block || typeof block.id !== 'string') continue;
    const bundle = block.bundle_id ? bundleById.get(block.bundle_id) : null;
    const world =
      bundle && bundle.world_id ? worldById.get(bundle.world_id) || ORPHAN_WORLD : ORPHAN_WORLD;
    const worldEntry = ensureWorld(world);
    if (bundle) {
      addBlock(worldEntry, bundle.id, bundle, block);
    } else {
      addBlock(worldEntry, '__direct__', ORPHAN_BUNDLE, block);
    }
  }

  // worlds 등장 순서 + 그 뒤에 ORPHAN_WORLD를 둔다.
  // worlds 안에서 order 필드가 있으면 그 순서를 우선.
  const knownWorldOrder = [...worlds]
    .filter((w) => w && typeof w.id === 'string' && result.has(w.id))
    .sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY;
      const bo = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY;
      return ao - bo;
    })
    .map((w) => w.id);
  const finalOrder = [...knownWorldOrder];
  if (result.has(ORPHAN_WORLD.id) && !finalOrder.includes(ORPHAN_WORLD.id)) {
    finalOrder.push(ORPHAN_WORLD.id);
  }

  return finalOrder.map((wid) => {
    const entry = result.get(wid);
    return {
      world: entry.world,
      groups: entry.bundleOrder.map((bid) => {
        const g = entry.byBundle.get(bid);
        return { bundle: g.bundle, blocks: g.blocks };
      }),
    };
  });
}

// 블럭 ID 하나를 받아 catalog에서 메타를 끌어온다. confirm 단계의 한국어 풀이용.
// 없으면 { id, name: id, user_desc: '' } 폴백(graceful).
export function lookupBlockDetail(catalog, blockId) {
  const blocks = Array.isArray(catalog?.blocks) ? catalog.blocks : [];
  const found = blocks.find((b) => b && b.id === blockId);
  if (!found) {
    return { id: blockId, name: blockId, user_desc: '' };
  }
  return {
    id: found.id,
    name: typeof found.name === 'string' ? found.name : blockId,
    user_desc: typeof found.user_desc === 'string' ? found.user_desc : '',
  };
}

// focused description 한 단락을 합성한다(ADR 0031 결정 2).
// user_desc + priority(필수 자리) + effort_days + concerns 한 줄씩.
// 없는 자리는 비운다.
export function buildBlockDescription(block) {
  if (!block) return '';
  const lines = [];
  const userDesc = typeof block.user_desc === 'string' ? block.user_desc.trim() : '';
  if (userDesc) lines.push(userDesc);
  if (block.priority === 'required') lines.push('필수 자리예요.');
  if (typeof block.effort_days === 'number' && block.effort_days > 0) {
    lines.push(`예상 작업 ${block.effort_days}일.`);
  }
  if (Array.isArray(block.concerns) && block.concerns.length) {
    const top = block.concerns
      .filter((c) => typeof c === 'string')
      .slice(0, 3)
      .join(', ');
    if (top) lines.push(`주의: ${top}`);
  }
  return lines.join(' ');
}

// 한 줄로 잘라 표시한다. confirm 단계의 user_desc 자리(70자 권장).
export function truncateOneLine(text, max = 70) {
  if (typeof text !== 'string') return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1) + '…';
}
