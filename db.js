const path = require("path");
const Database = require("better-sqlite3");

// Bloco 1: cria/abre o arquivo local do banco SQLite.
const dbPath = path.join(__dirname, "acougue.db");
const db = new Database(dbPath);

// Bloco 2: configurações importantes para integridade e performance.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Bloco 3: cria as tabelas principais do sistema.
db.exec(`
CREATE TABLE IF NOT EXISTS cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL UNIQUE,
  email TEXT,
  endereco TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS produto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  preco REAL NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'geral',
  imagem_url TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS estoque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL UNIQUE,
  quantidade REAL NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'kg',
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (produto_id) REFERENCES produto(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_pedido INTEGER,
  cliente_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'recebido',
  total REAL NOT NULL DEFAULT 0,
  tipo_entrega TEXT NOT NULL,
  endereco_entrega TEXT,
  observacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES cliente(id)
);

CREATE TABLE IF NOT EXISTS pedido_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL,
  produto_id INTEGER NOT NULL,
  quantidade REAL NOT NULL,
  preco_unitario REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedido(id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id) REFERENCES produto(id)
);

CREATE TABLE IF NOT EXISTS pedido_sequencia (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ultimo_numero INTEGER NOT NULL DEFAULT 0
);
`);

// Bloco 3.1: garante compatibilidade com banco antigo (sem numero_pedido).
const pedidoColumns = db.prepare("PRAGMA table_info(pedido)").all();
const hasNumeroPedido = pedidoColumns.some((col) => col.name === "numero_pedido");
if (!hasNumeroPedido) {
  db.exec("ALTER TABLE pedido ADD COLUMN numero_pedido INTEGER");
}

// Bloco 3.3: migração — adiciona colunas de endereço estruturado ao cliente.
const clienteColumns = db.prepare("PRAGMA table_info(cliente)").all().map((c) => c.name);
["rua", "numero", "bairro", "cidade", "complemento"].forEach((col) => {
  if (!clienteColumns.includes(col)) {
    db.exec(`ALTER TABLE cliente ADD COLUMN ${col} TEXT`);
  }
});

// Bloco 3.4: migração — adiciona coluna de imagem ao produto.
const produtoColumns = db.prepare("PRAGMA table_info(produto)").all().map((c) => c.name);
if (!produtoColumns.includes("imagem_url")) {
  db.exec("ALTER TABLE produto ADD COLUMN imagem_url TEXT");
}

// Bloco 3.2: cria linha unica da sequencia de numero de pedido (1 a 1000).
db.prepare("INSERT OR IGNORE INTO pedido_sequencia (id, ultimo_numero) VALUES (1, 0)").run();

// Bloco 4: popula produtos iniciais apenas se o banco estiver vazio.
const totalProdutos = db.prepare("SELECT COUNT(*) AS total FROM produto").get().total;

if (totalProdutos === 0) {
  const produtosIniciais = [
    { nome: "Contra File", preco: 64.98, categoria: "bovino", ativo: 1 },
    { nome: "Picanha", preco: 79.98, categoria: "bovino", ativo: 1 },
    { nome: "Maminha", preco: 57.98, categoria: "bovino", ativo: 1 },
    { nome: "Costela-Ripa", preco: 22.98, categoria: "bovino", ativo: 1 },
    { nome: "Bisteca", preco: 28.9, categoria: "suino", ativo: 1 },
  ];

  const insertProduto = db.prepare(
    "INSERT INTO produto (nome, preco, categoria, ativo) VALUES (?, ?, ?, ?)"
  );

  const insertEstoque = db.prepare(
    "INSERT INTO estoque (produto_id, quantidade, unidade) VALUES (?, ?, ?)"
  );

  const seed = db.transaction((items) => {
    for (const item of items) {
      const info = insertProduto.run(item.nome, item.preco, item.categoria, item.ativo);
      insertEstoque.run(info.lastInsertRowid, 0, "kg");
    }
  });

  seed(produtosIniciais);
}

module.exports = { db };
