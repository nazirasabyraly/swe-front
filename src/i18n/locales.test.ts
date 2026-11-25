import en from './locales/en.json';
import kk from './locales/kk.json';
import ru from './locales/ru.json';

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Flattens to dot paths, folding plural variants (`x_one`, `x_few`…) into `x`. */
function keys(obj: object, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix + key.replace(PLURAL_SUFFIX, '');
    if (value && typeof value === 'object') keys(value, `${path}.`).forEach((k) => out.add(k));
    else out.add(path);
  }
  return out;
}

function emptyValues(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? emptyValues(value, `${prefix}${key}.`)
      : String(value).trim() ? [] : [prefix + key],
  );
}

describe('translation files', () => {
  const base = keys(en);

  it.each([
    ['ru', ru],
    ['kk', kk],
  ])('%s has exactly the same keys as en', (_, messages) => {
    const other = keys(messages);
    expect([...base].filter((k) => !other.has(k))).toEqual([]);
    expect([...other].filter((k) => !base.has(k))).toEqual([]);
  });

  it.each([
    ['en', en],
    ['ru', ru],
    ['kk', kk],
  ])('%s has no empty strings', (_, messages) => {
    expect(emptyValues(messages)).toEqual([]);
  });

  it('ru defines every plural form Russian needs', () => {
    const flat = JSON.stringify(ru);
    for (const key of ['errorSummary', 'spots', 'imagesExisting']) {
      for (const form of ['one', 'few', 'many', 'other']) expect(flat).toContain(`"${key}_${form}"`);
    }
  });
});
