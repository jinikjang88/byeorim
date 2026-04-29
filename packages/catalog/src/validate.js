// 카탈로그 검증. ajv로 JSON Schema 형식을 보고, 별도 함수로 ID 참조 무결성을 본다
// ADR 0005 참조

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '..', 'schemas', 'catalog.schema.json');
const catalogSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(catalogSchema);

function formatSchemaErrors(errors) {
  return (errors || []).map((err) => ({
    kind: 'schema',
    path: err.instancePath || '/',
    message: err.message,
    params: err.params,
  }));
}

function collectIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items || []) {
    if (!item || typeof item.id !== 'string') continue;
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return { ids: seen, duplicates };
}

function validateReferences(catalog) {
  const errors = [];
  const worlds = catalog.worlds || [];
  const bundles = catalog.bundles || [];
  const blocks = catalog.blocks || [];
  const dependencies = catalog.dependencies || [];
  const cascades = catalog.cascades || [];
  const prerequisites = catalog.prerequisites || [];

  const worldIds = collectIds(worlds);
  const bundleIds = collectIds(bundles);
  const blockIds = collectIds(blocks);
  const prereqIds = collectIds(prerequisites);

  const pushDup = (kind, dups) => {
    for (const id of dups) {
      errors.push({
        kind: 'reference',
        path: `/${kind}`,
        message: `${kind} id 중복: ${id}`,
      });
    }
  };
  pushDup('worlds', worldIds.duplicates);
  pushDup('bundles', bundleIds.duplicates);
  pushDup('blocks', blockIds.duplicates);
  pushDup('prerequisites', prereqIds.duplicates);

  bundles.forEach((bundle, i) => {
    if (bundle && bundle.world_id && !worldIds.ids.has(bundle.world_id)) {
      errors.push({
        kind: 'reference',
        path: `/bundles/${i}/world_id`,
        message: `존재하지 않는 world id 참조: ${bundle.world_id}`,
      });
    }
  });

  blocks.forEach((block, i) => {
    if (block && block.bundle_id && !bundleIds.ids.has(block.bundle_id)) {
      errors.push({
        kind: 'reference',
        path: `/blocks/${i}/bundle_id`,
        message: `존재하지 않는 bundle id 참조: ${block.bundle_id}`,
      });
    }
  });

  dependencies.forEach((dep, i) => {
    if (!dep) return;
    if (dep.source && !blockIds.ids.has(dep.source)) {
      errors.push({
        kind: 'reference',
        path: `/dependencies/${i}/source`,
        message: `존재하지 않는 block id 참조: ${dep.source}`,
      });
    }
    if (dep.target && !blockIds.ids.has(dep.target)) {
      errors.push({
        kind: 'reference',
        path: `/dependencies/${i}/target`,
        message: `존재하지 않는 block id 참조: ${dep.target}`,
      });
    }
  });

  cascades.forEach((cascade, i) => {
    if (!cascade) return;
    if (cascade.trigger && !blockIds.ids.has(cascade.trigger)) {
      errors.push({
        kind: 'reference',
        path: `/cascades/${i}/trigger`,
        message: `존재하지 않는 block id 참조: ${cascade.trigger}`,
      });
    }
    (cascade.add_blocks || []).forEach((id, j) => {
      if (!blockIds.ids.has(id)) {
        errors.push({
          kind: 'reference',
          path: `/cascades/${i}/add_blocks/${j}`,
          message: `존재하지 않는 block id 참조: ${id}`,
        });
      }
    });
  });

  prerequisites.forEach((prereq, i) => {
    if (!prereq) return;
    (prereq.enables || []).forEach((id, j) => {
      if (!blockIds.ids.has(id)) {
        errors.push({
          kind: 'reference',
          path: `/prerequisites/${i}/enables/${j}`,
          message: `존재하지 않는 block id 참조: ${id}`,
        });
      }
    });
    (prereq.requires_prereq || []).forEach((id, j) => {
      if (!prereqIds.ids.has(id)) {
        errors.push({
          kind: 'reference',
          path: `/prerequisites/${i}/requires_prereq/${j}`,
          message: `존재하지 않는 prerequisite id 참조: ${id}`,
        });
      }
    });
  });

  return errors;
}

export function validateCatalog(catalog) {
  const errors = [];
  const ok = validateSchema(catalog);
  if (!ok) errors.push(...formatSchemaErrors(validateSchema.errors));
  if (catalog && typeof catalog === 'object') {
    errors.push(...validateReferences(catalog));
  }
  return { valid: errors.length === 0, errors };
}

export { catalogSchema };
