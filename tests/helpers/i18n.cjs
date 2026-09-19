// Shared helper: load the real i18n dictionary so vm/new Function sandboxes that
// evaluate lib fragments get a working `t` (defaults to English assertions).
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function loadI18n() {
  const source = readFileSync(join(__dirname, '..', '..', 'lib', 'i18n-ui.js'), 'utf8');
  const start = source.indexOf('const i18nDict = ');
  const end = source.indexOf('\n    };', start) + '\n    };'.length;
  const i18nDict = new Function(`${source.slice(start, end)}; return i18nDict;`)();
  const t = (key, vars, lang = 'en') => {
    const value = i18nDict[lang]?.[key] ?? i18nDict.en[key] ?? key;
    return vars ? value.replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match) : value;
  };
  return { i18nDict, t };
}

module.exports = { loadI18n };
