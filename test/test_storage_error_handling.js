const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  PASS ${message}`);
}

function createSupabaseMock(responses) {
  const calls = { removed: [], deletedImageIds: [] };
  const client = {
    auth: {},
    storage: {
      from() {
        return {
          upload: async () => ({ data: {}, error: null }),
          getPublicUrl(filePath) {
            return { data: { publicUrl: `https://storage.invalid/${filePath}` } };
          },
          remove: async paths => {
            calls.removed.push(paths);
            return { data: paths, error: null };
          }
        };
      }
    },
    from(table) {
      let action;
      const builder = {
        insert() {
          action = 'insert';
          return this;
        },
        update() {
          action = 'update';
          return this;
        },
        delete() {
          action = 'delete';
          return this;
        },
        select() {
          return this;
        },
        eq(column, value) {
          if (table === 'product_images' && action === 'delete' && column === 'id') {
            calls.deletedImageIds.push(value);
          }
          return this;
        },
        is() {
          return this;
        },
        single() {
          return Promise.resolve(responses[`${table}.${action}`] || { data: {}, error: null });
        },
        maybeSingle() {
          return Promise.resolve(responses[`${table}.${action}`] || { data: {}, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve(responses[`${table}.${action}`] || { data: {}, error: null })
            .then(resolve, reject);
        }
      };
      return builder;
    }
  };
  return { client, calls };
}

function loadClient(supabaseClient) {
  const window = {
    EMPREHUB_CONFIG: {
      SUPABASE_URL: 'https://project.invalid',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      isConfigured: () => true
    },
    supabase: { createClient: () => supabaseClient }
  };
  const sandbox = {
    window,
    document: { addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { info: () => {}, warn: () => {}, error: () => {} }
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/supabase-client.js'), 'utf8');
  vm.runInContext(source, sandbox);
  return window.EH.client;
}

async function expectRejected(promise, message) {
  try {
    await promise;
  } catch (error) {
    assert(error.message === message, `La operación propaga el error original: ${message}`);
    return;
  }
  throw new Error(`Se esperaba que la operación fallara: ${message}`);
}

async function run() {
  const insertFailure = new Error('image row insert failed');
  const insertMock = createSupabaseMock({ 'product_images.insert': { data: null, error: insertFailure } });
  const insertClient = loadClient(insertMock.client);
  await expectRejected(
    insertClient.storage.uploadProductImage({ type: 'image/png', size: 20, name: 'image.png' }, 'business-id', 'product-id'),
    insertFailure.message
  );
  assert(insertMock.calls.removed.length === 1, 'Se elimina del Storage la imagen cuyo registro falló');

  const updateFailure = new Error('product update failed');
  const updateMock = createSupabaseMock({
    'product_images.insert': { data: { id: 'image-row-id' }, error: null },
    'products.update': { data: null, error: updateFailure }
  });
  const updateClient = loadClient(updateMock.client);
  await expectRejected(
    updateClient.storage.uploadProductImage({ type: 'image/png', size: 20, name: 'image.png' }, 'business-id', 'product-id'),
    updateFailure.message
  );
  assert(updateMock.calls.deletedImageIds[0] === 'image-row-id', 'Se revierte el registro de imagen tras fallar la actualización del producto');
  assert(updateMock.calls.removed.length === 1, 'Se elimina del Storage el archivo tras fallar la actualización del producto');

  const businessFailure = new Error('business update failed');
  const logoMock = createSupabaseMock({ 'businesses.update': { data: null, error: businessFailure } });
  const logoClient = loadClient(logoMock.client);
  await expectRejected(
    logoClient.storage.uploadBusinessLogo({ type: 'image/jpeg', size: 20, name: 'logo.jpg' }, 'business-id'),
    businessFailure.message
  );
  assert(logoMock.calls.removed.length === 1, 'Se elimina del Storage el logo cuyo emprendimiento no pudo actualizarse');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
