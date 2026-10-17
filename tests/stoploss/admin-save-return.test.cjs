const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function recipePage() {
  const invalidated = [], navigation = [], notices = [], mutations = [];
  const code = ts.transpileModule(fs.readFileSync('client-admin/src/pages/bom/RecipeEditPage.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const hooks = {
    useState: value => [value, () => {}], useEffect: () => {},
    useMemo: fn => fn(), useCallback: fn => fn
  };
  const module = { exports: {} };
  const requireStub = name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    if (name === 'react-router-dom') return { useParams: () => ({ id: 'product-123' }), useNavigate: () => (...args) => navigation.push(args) };
    if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key, i18n: { language: 'zh' } }) };
    if (name === '@tanstack/react-query') return {
      useQuery: () => ({ isLoading: false }),
      useMutation: options => { mutations.push(options); return {}; },
      useQueryClient: () => ({ invalidateQueries: ({ queryKey }) => invalidated.push(queryKey) })
    };
    if (name.endsWith('/auth')) return { useAuthStore: () => ({}) };
    if (name.endsWith('/AdminFeedback')) return { notifyAdmin: message => notices.push(message), confirmAdmin: async () => true };
    if (name.endsWith('/recipeCost')) return { recipeTotalCost: () => 0 };
    return {};
  };
  new Function('exports', 'module', 'require', code)(module.exports, module, requireStub);
  module.exports.RecipeEditPage();
  return { mutation: mutations[0], invalidated, navigation, notices };
}

test('successful recipe save refreshes detail/list caches and returns to that product without a notice', () => {
  const page = recipePage();
  page.mutation.onSuccess();
  assert.deepEqual(page.navigation, [['/products/recipes?productId=product-123', { replace: true }]]);
  assert.deepEqual(page.invalidated, [['bom-product', 'product-123'], ['bom-products'], ['products'], ['product', 'product-123']]);
  assert.deepEqual(page.notices, []);
});

test('failed recipe save stays on the form and retains the backend error', () => {
  const page = recipePage();
  page.mutation.onError({ response: { data: { message: '库存原料已停用' } } });
  assert.deepEqual(page.navigation, []);
  assert.deepEqual(page.invalidated, []);
  assert.deepEqual(page.notices, ['库存原料已停用']);
});
