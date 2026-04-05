
// Recomenda-se renomear este arquivo para "script.js" ou "main.js" para evitar confusão.

(function () {
  // Utiliza configuração centralizada em config.js
  const WHATSAPP_NUMBER = window.APP_CONFIG?.WHATSAPP_NUMBER || "5512991307272";
  const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || (() => {
    const host = window.location.hostname;
    const isFile = window.location.protocol === "file:";
    const isLocal = host === "localhost" || host === "127.0.0.1";
    return isLocal || isFile ? "http://localhost:3000" : "";
  })();
  const API_ENABLED = window.APP_CONFIG?.API_ENABLED ?? Boolean(API_BASE_URL);

  const carrinho = [];
  let cartStep = "cart";
  let clienteNome = "";
  let clienteTelefone = "";
  let clienteEmail = "";
  let clienteEndereco = "";
  let tipoEntrega = null;
  let observacaoCompra = "";
  let urlWhatsAppPedido = "";
  let totalPedido = 0; // ← NOVO: Armazena o valor do pedido
  // campos estruturados de endereço (entrega)
  let clienteRua = "";
  let clienteNumero = "";
  let clienteBairro = "";
  let clienteCidade = "";
  let clienteComplemento = "";

  const listaCarrinho = document.getElementById("lista-carrinho");
  const carrinhoContainer = document.getElementById("carrinho-container");
  const btnFinalizar = document.getElementById("btn-finalizar");
  const btnCarrinhoFixo = document.getElementById("btn-carrinho-fixo");
  const modalConfirmacao = document.getElementById("modal-confirmacao");
  const btnConfirmarEnvio = document.getElementById("btn-confirmar-envio");
  const btnCancelarEnvio = document.getElementById("btn-cancelar-envio");
  const modalObservacao = document.getElementById("modal-observacao");
  const inputObservacao = document.getElementById("input-observacao");
  const btnEnviarObservacao = document.getElementById("btn-enviar-observacao");
  const btnOkObservacao = document.getElementById("btn-ok-observacao");

  let totalCarrinhoEl = null;
  let cartActionsEl = null;

  const formatCurrency = (valor) => {
    return valor.toFixed(2).replace(".", ",");
  };

  const parsePrice = (priceText) => {
    const match = (priceText || "").match(/\d+[\.,]\d+/);
    if (!match) {
      return 0;
    }
    return parseFloat(match[0].replace(",", "."));
  };

  const getTotal = () => {
    return carrinho.reduce((sum, item) => sum + item.subtotal, 0);
  };

  // Bloco utilitario: normaliza textos para comparar nomes com e sem acento/hifen.
  const normalizeText = (text) => {
    return (text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  };

  const CATEGORY_SECTION_ID = {
    bovino: "bovino",
    suino: "suino",
    frango: "frango",
    rotisseria: "Rotisseria",
    conveniencia: "Conveniencia",
  };

  const CATEGORY_PLACEHOLDER_IMAGE = {
    bovino: "imagens_projeto_acougue/Carne_Primeira/Contra-file.jpeg",
    suino: "imagens_projeto_acougue/Carnes_Segunda/Bisteca.jpeg",
    frango: "imagens_projeto_acougue/Pasta_Frango/coxasobrecoxa.jpeg",
    rotisseria: "imagens_projeto_acougue/Rotisseria/costelaRecheadaAssada.jpeg",
    conveniencia: "imagens_projeto_acougue/Conveniencia/Oleo.jpeg",
    geral: "imagens_projeto_acougue/Apresentacao/imagem.logo.joia.jpeg.png",
  };

  const getSectionProductsContainer = (categoria) => {
    const key = String(categoria || "").toLowerCase();
    const sectionId = CATEGORY_SECTION_ID[key] || CATEGORY_SECTION_ID.bovino;
    return document.querySelector(`#${sectionId} .produtos`);
  };

  const removeDuplicateCardsFromDom = () => {
    const seen = new Set();
    document.querySelectorAll(".produto").forEach((card) => {
      const nameEl = card.querySelector("h3");
      const key = normalizeText(nameEl?.innerText || "");
      if (!key) {
        return;
      }

      if (seen.has(key)) {
        card.remove();
        return;
      }

      seen.add(key);
    });
  };

  const criarCardProduto = (apiProduct) => {
    const categoria = String(apiProduct?.categoria || "geral").toLowerCase();
    const imgSrc = CATEGORY_PLACEHOLDER_IMAGE[categoria] || CATEGORY_PLACEHOLDER_IMAGE.geral;

    const card = document.createElement("div");
    card.className = "produto";
    card.innerHTML = `
      <img src="${imgSrc}" alt="${apiProduct.nome}">
      <h3>${apiProduct.nome}</h3>
      <p class="preco">R$ ${formatCurrency(Number(apiProduct.preco || 0))} / kg</p>
      <label>Seleção:</label>
      <select>
        <option value="churrasco">Corte para Churrasco</option>
        <option value="bife">Corte para Bife</option>
      </select>
      <label>Peso (kg):</label>
      <input type="number" step="0.1" min="0.1" max="10">
      <button class="btn-comprar">Adicionar ao Carrinho</button>
    `;

    card.setAttribute("data-product-id", String(apiProduct.id));
    card.setAttribute("data-product-category", categoria || "geral");
    return card;
  };

  // Bloco integracao: aplica preco e disponibilidade vindo da API nos cards do site.
  const applyApiProductsToCards = (apiProducts) => {
    // Garante que cards repetidos no HTML/DOM sejam removidos antes da sincronizacao.
    removeDuplicateCardsFromDom();

    // Monta mapa de nome normalizado para produto da API.
    const productsByName = new Map();

    apiProducts.forEach((product) => {
      const key = normalizeText(product.nome);
      if (!key) {
        return;
      }
      productsByName.set(key, product);
    });

    // Cria cards para produtos novos da API que ainda nao existem no HTML.
    apiProducts.forEach((product) => {
      const key = normalizeText(product.nome);
      if (!key) {
        return;
      }

      const jaExiste = Array.from(document.querySelectorAll(".produto h3")).some(
        (el) => normalizeText(el.innerText) === key
      );

      if (jaExiste) {
        return;
      }

      const container = getSectionProductsContainer(product.categoria);
      if (!container) {
        return;
      }

      const novoCard = criarCardProduto(product);
      container.appendChild(novoCard);
      const novoBotao = novoCard.querySelector(".btn-comprar");
      if (novoBotao) {
        bindBuyButton(novoBotao);
      }
    });

    document.querySelectorAll(".produto").forEach((card) => {
      const nameEl = card.querySelector("h3");
      const priceEl = card.querySelector(".preco");
      const btnComprar = card.querySelector(".btn-comprar");

      if (!nameEl || !priceEl) {
        return;
      }

      const key = normalizeText(nameEl.innerText);
      const apiProduct = productsByName.get(key);

      // Se o produto nao existe na API, bloqueia no frontend para evitar
      // divergencia com o admin (produto visivel sem cadastro no backend).
      if (!apiProduct) {
        card.style.opacity = "0.5";
        card.style.filter = "grayscale(60%)";
        priceEl.innerText = "❌ FORA DE ESTOQUE";
        priceEl.style.color = "#c0392b";
        priceEl.style.fontWeight = "bold";
        priceEl.style.fontSize = "1.1rem";

        if (btnComprar) {
          btnComprar.disabled = true;
          btnComprar.textContent = "Fora de Estoque";
          btnComprar.style.background = "#aaa";
          btnComprar.style.cursor = "not-allowed";
          btnComprar.title = "Produto não cadastrado no backend";
        }
        return;
      }

      // Aplica o preco oficial da API no card.
      const hasKg = /\/\s*kg/i.test(priceEl.innerText);
      const suffix = hasKg ? " / kg" : "";
      priceEl.innerText = `R$ ${formatCurrency(apiProduct.preco)}${suffix}`;
      card.setAttribute("data-product-id", String(apiProduct.id));
      card.setAttribute("data-product-category", apiProduct.categoria || "geral");

      // Bloco disponibilidade: usa a disponibilidade calculada pela API.
      // Fallback para ativo quando a API antiga nao envia o campo 'disponivel'.
      // O produto continua visivel para o cliente saber que existe,
      // mas o botao fica desabilitado e o card aparece acinzentado.
      const isDisponivel =
        typeof apiProduct.disponivel === "boolean"
          ? apiProduct.disponivel
          : apiProduct.ativo !== false;

      if (!isDisponivel) {
        card.style.opacity = "0.5";
        card.style.filter = "grayscale(60%)";

        // Substitui o preco por aviso de indisponibilidade.
        priceEl.innerText = "❌ FORA DE ESTOQUE";
        priceEl.style.color = "#c0392b";
        priceEl.style.fontWeight = "bold";
        priceEl.style.fontSize = "1.1rem";

        // Desabilita botao de compra para impedir adicionar ao carrinho.
        if (btnComprar) {
          btnComprar.disabled = true;
          btnComprar.textContent = "Fora de Estoque";
          btnComprar.style.background = "#aaa";
          btnComprar.style.cursor = "not-allowed";
          btnComprar.title = "Este produto está temporariamente indisponível";
        }
      } else {
        // Bloco restauracao: garante que o card fique normal se foi reativado.
        card.style.opacity = "";
        card.style.filter = "";
        priceEl.style.color = "";
        priceEl.style.fontWeight = "";
        priceEl.style.fontSize = "";

        if (btnComprar) {
          btnComprar.disabled = false;
          btnComprar.textContent = "Adicionar ao Carrinho";
          btnComprar.style.background = "";
          btnComprar.style.cursor = "";
          btnComprar.title = "";
        }
      }
    });
  };

  // Bloco integracao: busca produtos no backend ao carregar a pagina.
  const loadProductsFromApi = async () => {
    if (!API_ENABLED) {
      console.warn("API desativada neste ambiente. Mantendo catalogo do HTML.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/produtos`);
      if (!response.ok) {
        throw new Error(`Falha HTTP: ${response.status}`);
      }

      const products = await response.json();
      if (!Array.isArray(products)) {
        throw new Error("Resposta da API invalida");
      }

      applyApiProductsToCards(products);
      console.log("Produtos sincronizados com a API.");
    } catch (error) {
      console.warn("Nao foi possivel sincronizar produtos da API:", error.message);
    }
  };

  // Bloco integracao: le os cards do HTML e monta um catalogo padronizado.
  const collectCatalogFromDom = () => {
    const catalogo = [];

    document.querySelectorAll(".produto").forEach((card) => {
      const nameEl = card.querySelector("h3");
      const priceEl = card.querySelector(".preco");
      const section = card.closest("section");

      if (!nameEl || !priceEl) {
        return;
      }

      const nome = nameEl.innerText.trim();
      const preco = parsePrice(priceEl.innerText);
      const categoria = section?.id ? String(section.id).toLowerCase() : "geral";

      if (!nome || !preco || preco <= 0) {
        return;
      }

      catalogo.push({ nome, preco, categoria });
    });

    return catalogo;
  };

  // Bloco integracao: envia o catalogo do frontend para API e faz upsert em lote.
  const syncCatalogWithApi = async () => {
    if (!API_ENABLED) {
      return;
    }

    const catalogo = collectCatalogFromDom();

    if (catalogo.length === 0) {
      console.warn("Nenhum produto do HTML foi encontrado para sincronizar.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/produtos/sync-catalogo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtos: catalogo }),
      });

      if (!response.ok) {
        throw new Error(`Falha HTTP: ${response.status}`);
      }

      const result = await response.json();
      console.log("Catalogo sincronizado:", result.resumo);
    } catch (error) {
      console.warn("Nao foi possivel enviar catalogo para API:", error.message);
    }
  };

  // Bloco bootstrap: primeiro sincroniza catalogo e depois puxa os precos da API.
  const bootstrapProductSync = async () => {
    await syncCatalogWithApi();
    await loadProductsFromApi();
  };

  const inicializarCarrinhoUI = () => {
    if (!carrinhoContainer || !listaCarrinho) {
      return;
    }

    if (btnFinalizar) {
      btnFinalizar.style.display = "none";
    }

    totalCarrinhoEl = document.createElement("p");
    totalCarrinhoEl.id = "cart-total-linha";
    totalCarrinhoEl.style.marginTop = "12px";
    totalCarrinhoEl.style.padding = "12px";
    totalCarrinhoEl.style.background = "#f8f9fa";
    totalCarrinhoEl.style.borderRadius = "6px";
    totalCarrinhoEl.style.borderLeft = "4px solid #b30000";
    totalCarrinhoEl.innerHTML = `<strong style="color:#b30000; font-size:1.1em;">💰 Total: R$ <span id="cart-total" style="color:#333; font-size:1.2em;">0,00</span></strong>`;
    carrinhoContainer.appendChild(totalCarrinhoEl);

    cartActionsEl = document.createElement("div");
    cartActionsEl.id = "cart-actions";
    cartActionsEl.style.marginTop = "10px";
    carrinhoContainer.appendChild(cartActionsEl);
  };

  const solicitarConfirmacaoEnvio = () => {
    return new Promise((resolve) => {
      if (!modalConfirmacao || !btnConfirmarEnvio || !btnCancelarEnvio) {
        resolve(true);
        return;
      }

      const confirmar = () => {
        limparEventos();
        modalConfirmacao.classList.remove("aberto");
        modalConfirmacao.setAttribute("aria-hidden", "true");
        resolve(true);
      };

      const cancelar = () => {
        limparEventos();
        modalConfirmacao.classList.remove("aberto");
        modalConfirmacao.setAttribute("aria-hidden", "true");
        window.scrollTo({ top: 0, behavior: "smooth" });
        resolve(false);
      };

      const cliqueFora = (event) => {
        if (event.target === modalConfirmacao) {
          cancelar();
        }
      };

      const limparEventos = () => {
        btnConfirmarEnvio.removeEventListener("click", confirmar);
        btnCancelarEnvio.removeEventListener("click", cancelar);
        modalConfirmacao.removeEventListener("click", cliqueFora);
      };

      btnConfirmarEnvio.addEventListener("click", confirmar);
      btnCancelarEnvio.addEventListener("click", cancelar);
      modalConfirmacao.addEventListener("click", cliqueFora);

      modalConfirmacao.classList.add("aberto");
      modalConfirmacao.setAttribute("aria-hidden", "false");
    });
  };

  const solicitarObservacaoCompra = () => {
    return new Promise((resolve) => {
      if (!modalObservacao || !btnEnviarObservacao || !btnOkObservacao || !inputObservacao) {
        resolve("");
        return;
      }

      const fecharModal = () => {
        modalObservacao.classList.remove("aberto");
        modalObservacao.setAttribute("aria-hidden", "true");
      };

      const limparEventos = () => {
        btnEnviarObservacao.removeEventListener("click", enviarObservacao);
        btnOkObservacao.removeEventListener("click", confirmarSemObservacao);
        modalObservacao.removeEventListener("click", cliqueFora);
      };

      const enviarObservacao = () => {
        const texto = inputObservacao.value.trim();
        if (!texto) {
          alert("Digite uma observação ou clique em OK para continuar sem observação.");
          return;
        }
        limparEventos();
        fecharModal();
        resolve(texto);
      };

      const confirmarSemObservacao = () => {
        limparEventos();
        fecharModal();
        resolve("");
      };

      const cliqueFora = (event) => {
        if (event.target === modalObservacao) {
          confirmarSemObservacao();
        }
      };

      inputObservacao.value = "";
      btnEnviarObservacao.addEventListener("click", enviarObservacao);
      btnOkObservacao.addEventListener("click", confirmarSemObservacao);
      modalObservacao.addEventListener("click", cliqueFora);

      modalObservacao.classList.add("aberto");
      modalObservacao.setAttribute("aria-hidden", "false");
      inputObservacao.focus();
    });
  };


  const renderCarrinho = () => {
    if (!listaCarrinho || !cartActionsEl) {
      return;
    }

    const totalEl = document.getElementById("cart-total");
    if (totalEl) {
      totalEl.textContent = formatCurrency(getTotal());
    }

    if (carrinho.length === 0) {
      listaCarrinho.innerHTML = `
        <li style="text-align: center; padding: 20px; color: #999;">
          🛒 Seu carrinho está vazio<br>
          <span style="font-size: 0.9rem;">Selecione produtos na loja para começar</span>
        </li>
      `;
    } else {
      listaCarrinho.innerHTML = carrinho
        .map((item, index) => {
          const unidade = item.unit === "kg" ? `${item.quantity}kg` : `${item.quantity}x`;
          const opcao = item.option ? ` - ${item.option}` : "";
          return `<li style="margin-bottom:8px;">${item.name}${opcao} - ${unidade} - R$ ${formatCurrency(item.subtotal)} <button data-remove="${index}" type="button" style="margin-left:6px;">✕</button></li>`;
        })
        .join("");
    }

    if (cartStep === "cart") {
      cartActionsEl.innerHTML = `
        <div style="padding: 10px 0; border-top: 1px solid #eee; margin-top: 10px;">
          <p style="font-size: 0.9rem; color: #666; margin-bottom: 12px;">📋 Próximo passo: Confirme seu pedido</p>
        </div>
        <button id="btn-iniciar-checkout" type="button" style="margin-right:8px;">📲 Finalizar via WhatsApp</button>
        <button id="btn-limpar-carrinho" type="button" style="margin-right:8px;">🗑 Limpar Carrinho</button>
        <button id="btn-voltar-topo" type="button">⬆ Voltar ao Início</button>
      `;
    } else if (cartStep === "nome") {
      cartActionsEl.innerHTML = `
        <div style="padding: 10px 0; margin-bottom: 12px; border-top: 1px solid #eee;">
          <p style="font-weight: bold; color: #b30000; margin-bottom: 8px;">📝 ETAPA 1: Seus Dados</p>
          <p style="font-size: 0.9rem; color: #666;">Preencha suas informações de contato</p>
        </div>
        <input type="text" id="input-nome" placeholder="Seu nome *" value="${clienteNome}" style="width:100%; margin-bottom:8px; padding:8px;" />
        <input type="tel" id="input-telefone" placeholder="Telefone / WhatsApp (12 99999-9999) *" value="${clienteTelefone}" style="width:100%; margin-bottom:8px; padding:8px;" />
        <input type="email" id="input-email" placeholder="E-mail (opcional)" value="${clienteEmail}" style="width:100%; margin-bottom:8px; padding:8px;" />
        <button id="btn-salvar-nome" type="button" style="margin-right:8px;">✓ Continuar</button>
        <button id="btn-voltar-cart" type="button">← Voltar</button>
      `;
    } else if (cartStep === "tipo") {
      cartActionsEl.innerHTML = `
        <div style="padding: 10px 0; margin-bottom: 12px; border-top: 1px solid #eee;">
          <p style="font-weight: bold; color: #b30000; margin-bottom: 8px;">🚚 ETAPA 2: Forma de Entrega</p>
          <p style="font-size: 0.9rem; color: #666;">Como você deseja receber seu pedido?</p>
        </div>
        <button id="btn-retirada" type="button" style="margin-right:8px; margin-bottom: 8px;">🏪 Retirada no Local</button>
        <button id="btn-entrega" type="button" style="margin-right:8px; margin-bottom: 8px;">🚚 Entregar em Minha Casa</button>
        <button id="btn-voltar-nome" type="button">← Voltar</button>
      `;
    } else if (cartStep === "endereco") {
      const inputStyle = "width:100%; margin-bottom:8px; padding:8px; box-sizing:border-box;";
      cartActionsEl.innerHTML = `
        <div style="padding: 10px 0; margin-bottom: 12px; border-top: 1px solid #eee;">
          <p style="font-weight: bold; color: #b30000; margin-bottom: 8px;">📍 ETAPA 3: Endereço de Entrega</p>
          <p style="font-size: 0.9rem; color: #666;">Preencha o endereço para entrega</p>
        </div>
        <input type="text" id="input-rua" placeholder="Rua / Avenida *" value="${clienteRua}" style="${inputStyle}" />
        <input type="text" id="input-numero" placeholder="Número *" value="${clienteNumero}" style="${inputStyle}" />
        <input type="text" id="input-bairro" placeholder="Bairro *" value="${clienteBairro}" style="${inputStyle}" />
        <input type="text" id="input-cidade" placeholder="Cidade *" value="${clienteCidade}" style="${inputStyle}" />
        <input type="text" id="input-complemento" placeholder="Complemento (apto, bloco, referência...)" value="${clienteComplemento}" style="${inputStyle}" />
        <button id="btn-salvar-endereco" type="button" style="margin-right:8px;">✓ Continuar</button>
        <button id="btn-voltar-tipo" type="button">← Voltar</button>
      `;
    } else if (cartStep === "confirmar") {
      const enderecoFormatado = tipoEntrega === "entrega"
        ? [clienteRua, clienteNumero, clienteBairro, clienteCidade, clienteComplemento].filter(Boolean).join(", ")
        : "";
      const entregaInfo =
        tipoEntrega === "retirada"
          ? "🏪 <strong>Retirada no local</strong>"
          : `📍 <strong>Entrega em:</strong> ${enderecoFormatado}`;
      const emailInfo = clienteEmail ? `<br>✉️ <strong>E-mail:</strong> ${clienteEmail}` : "";
      cartActionsEl.innerHTML = `
        <div style="padding: 10px 0; margin-bottom: 12px; border-top: 1px solid #eee;">
          <p style="font-weight: bold; color: #b30000; margin-bottom: 8px;">✓ ETAPA 4: Confirmação</p>
          <p style="font-size: 0.9rem; color: #666;">Revise seus dados antes de enviar</p>
        </div>
        <div style="margin-bottom:16px; padding:12px; background:#f8f9fa; border-radius:6px; border-left:4px solid #b30000;">
          <p style="margin-bottom: 8px;"><strong>👤 Cliente:</strong> ${clienteNome}</p>
          <p style="margin-bottom: 8px;"><strong>📱 Telefone:</strong> ${clienteTelefone}${emailInfo}</p>
          <p style="margin-bottom: 8px;">${entregaInfo}</p>
        </div>
        <div style="margin-bottom:16px; padding:12px; background:#f8f9fa; border-radius:6px; border-left:4px solid #b30000;">
          <strong style="font-size:1.1em; color:#b30000;">💰 Total do Pedido:</strong><br>
          <span style="font-size:1.3em; font-weight:bold; color:#333;">R$ ${formatCurrency(getTotal())}</span>
        </div>
        <button id="btn-enviar-whatsapp" type="button" style="margin-right:8px;">✓ Confirmar e Enviar</button>
        <button id="btn-voltar-confirmar" type="button">← Voltar</button>
      `;
    } else if (cartStep === "sucesso") {
      cartActionsEl.innerHTML = `
        <div style="text-align:center; padding:12px 0;">
          <p style="font-size:1.3em; font-weight:bold; margin-bottom:8px; color: #4caf50;">✅ PEDIDO REGISTRADO COM SUCESSO!</p>
          <p style="margin-bottom:16px; font-size: 0.95rem; color: #666;">Seu pedido foi recebido e confirmado no sistema</p>
          ${urlWhatsAppPedido._numeroPedido !== null ? `<p style="margin-bottom:20px; font-size: 1.5rem; font-weight: bold; color: #b30000;">Nº ${String(urlWhatsAppPedido._numeroPedido).padStart(3, "0")}</p>` : ''}

          <div style="margin-bottom:16px; padding:12px; background:#e8f5e9; border-radius:6px; border:2px solid #4caf50;">
            <strong style="font-size:0.95em; color:#2e7d32;">Valor Total Cobrado:</strong><br>
            <span style="font-size:1.4em; font-weight:bold; color:#2e7d32;">R$ ${formatCurrency(totalPedido)}</span>
          </div>
          
          <p style="margin-bottom:12px; font-size: 0.9rem; color: #666;">📲 O WhatsApp abrirá automaticamente. Caso seja bloqueado pelo navegador, clique no botão abaixo:</p>
          
          <a href="${urlWhatsAppPedido._url}" target="_blank"
             style="display:inline-block; background:#25D366; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold; margin-bottom:12px; font-size: 1rem;">
            💬 Abrir WhatsApp e Confirmar
          </a><br>
          <button id="btn-fechar-sucesso" type="button" style="margin-top:12px;">Fechar</button>
        </div>
      `;
    }
  };

  const iniciarCheckout = () => {
    if (carrinho.length === 0) {
      alert("Seu carrinho está vazio!");
      return;
    }
    cartStep = "nome";
    renderCarrinho();
  };

  const escolherRetirada = () => {
    tipoEntrega = "retirada";
    clienteEndereco = "Retirada no local";
    cartStep = "confirmar";
    renderCarrinho();
  };

  const escolherEntrega = () => {
    tipoEntrega = "entrega";
    cartStep = "endereco";
    renderCarrinho();
  };

  const voltarConfirmar = () => {
    if (tipoEntrega === "entrega") {
      cartStep = "endereco";
    } else {
      cartStep = "tipo";
    }
    renderCarrinho();
  };

  const limparCarrinho = () => {
    carrinho.length = 0;
    cartStep = "cart";
    clienteNome = "";
    clienteTelefone = "";
    clienteEmail = "";
    clienteEndereco = "";
    clienteRua = "";
    clienteNumero = "";
    clienteBairro = "";
    clienteCidade = "";
    clienteComplemento = "";
    tipoEntrega = null;
    observacaoCompra = "";
    if (inputObservacao) {
      inputObservacao.value = "";
    }
    renderCarrinho();
  };

  const enviarWhatsApp = async () => {
    const confirmouEnvio = await solicitarConfirmacaoEnvio();
    if (!confirmouEnvio) {
      return;
    }

    observacaoCompra = await solicitarObservacaoCompra();

    // Sem API em producao: envia direto para o WhatsApp sem bloqueio.
    if (!API_ENABLED) {
      const dataHoraPedido = new Date().toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });

      let mensagem = "*🥩 Pedido - Boutique das Carnes Joia*\n\n";
      mensagem += `*Data/Hora:* ${dataHoraPedido}\n`;
      mensagem += `*Cliente:* ${clienteNome}\n`;
      mensagem += `*Telefone:* ${clienteTelefone}\n`;
      if (clienteEmail) {
        mensagem += `*E-mail:* ${clienteEmail}\n`;
      }
      mensagem += tipoEntrega === "retirada"
        ? "*Retirada no local*\n\n"
        : `*Endereço:* ${[clienteRua, clienteNumero, clienteBairro, clienteCidade, clienteComplemento].filter(Boolean).join(", ")}\n\n`;
      mensagem += "*Itens do pedido:*\n";

      carrinho.forEach((item) => {
        const unitLabel = item.unit === "kg" ? `${item.quantity}kg` : `${item.quantity}x`;
        const optLabel = item.option ? ` - ${item.option}` : "";
        mensagem += `• ${item.name}${optLabel} - ${unitLabel} — R$ ${formatCurrency(item.subtotal)}\n`;
      });

      if (observacaoCompra) {
        mensagem += `\n*Observações da compra:*\n${observacaoCompra}\n`;
      }

      const valorTotal = getTotal(); // ← NOVO: Guarda o valor antes de limpar
      mensagem += `\n*Total base: R$ ${formatCurrency(valorTotal)}*`;

      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
      totalPedido = valorTotal; // ← NOVO: Armazena o valor global
      urlWhatsAppPedido = { _url: url, _numeroPedido: null };
      limparCarrinho();
      cartStep = "sucesso";
      renderCarrinho();
      return;
    }

    // Passo 1: garante que todos os itens tenham productId.
    // Se a pagina carregou antes da API responder, os cards podem estar sem o atributo.
    // Nesse caso, busca todos os produtos agora e faz match por nome.
    const itensResolve = carrinho.map((item) => ({ ...item }));
    const semId = itensResolve.filter((item) => !item.productId);

    if (semId.length > 0) {
      try {
        const respProdutos = await fetch(`${API_BASE_URL}/produtos`);
        if (respProdutos.ok) {
          const apiProducts = await respProdutos.json();
          if (Array.isArray(apiProducts)) {
            const byNome = new Map(
              apiProducts.map((p) => [normalizeText(p.nome), p])
            );
            itensResolve.forEach((item) => {
              if (!item.productId) {
                const match = byNome.get(normalizeText(item.name));
                if (match) {
                  item.productId = match.id;
                }
              }
            });
          }
        }
      } catch (e) {
        console.warn("Falha ao resolver IDs de produtos:", e.message);
      }
    }

    // Passo 2: valida estoque e registra pedido na API.
    const todosComId =
      itensResolve.length > 0 && itensResolve.every((item) => item.productId);

    if (!todosComId) {
      alert(
        "Não foi possível identificar os produtos selecionados.\nVerifique se o servidor está ligado, recarregue a página e tente novamente."
      );
      return;
    }

    let numeroPedido = null;

    try {
      // Validacao extra no frontend: confirma estoque atual de cada item
      // antes de registrar o pedido.
      for (const item of itensResolve) {
        const respEstoque = await fetch(`${API_BASE_URL}/estoque/${item.productId}`);
        const dadosEstoque = await respEstoque.json().catch(() => ({}));

        if (!respEstoque.ok) {
          alert("Não foi possível validar o estoque no momento. Tente novamente.");
          return;
        }

        const qtdDisponivel = Number(dadosEstoque?.estoque?.quantidade ?? 0);
        if (!Number.isFinite(qtdDisponivel) || qtdDisponivel < Number(item.quantity)) {
          alert(
            `Pedido não finalizado:\nEstoque insuficiente para ${item.name}. Disponível: ${qtdDisponivel}kg.`
          );
          return;
        }
      }

      const bodyPedido = {
        clienteNome: clienteNome,
        clienteTelefone: clienteTelefone,
        clienteEmail: clienteEmail || null,
        clienteRua: clienteRua || null,
        clienteNumero: clienteNumero || null,
        clienteBairro: clienteBairro || null,
        clienteCidade: clienteCidade || null,
        clienteComplemento: clienteComplemento || null,
        tipoEntrega: tipoEntrega,
        enderecoEntrega: tipoEntrega === "entrega"
          ? [clienteRua, clienteNumero, clienteBairro, clienteCidade, clienteComplemento].filter(Boolean).join(", ")
          : null,
        observacao: observacaoCompra || null,
        itens: itensResolve.map((item) => ({
          produtoId: item.productId,
          quantidade: item.quantity,
        })),
      };

      const resposta = await fetch(`${API_BASE_URL}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPedido),
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        alert(
          `Pedido não finalizado:\n${dados.error || "Erro ao registrar pedido. Tente novamente."}`
        );
        return;
      }

      numeroPedido = dados.pedido?.numero_pedido ?? null;

      if (!numeroPedido) {
        alert(
          "Pedido não finalizado: o servidor não retornou o número do pedido. Tente novamente."
        );
        return;
      }
    } catch (e) {
      alert(
        "Não foi possível conectar ao servidor para validar o estoque.\nVerifique se o sistema está ligado e tente novamente."
      );
      return;
    }

    // Passo 3: monta e envia a mensagem no WhatsApp.
    const dataHoraPedido = new Date().toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    let mensagem = "*🥩 Pedido - Boutique das Carnes Joia*\n\n";
    if (numeroPedido !== null) {
      mensagem += `*Nº Pedido:* ${String(numeroPedido).padStart(3, "0")}\n`;
    }
    mensagem += `*Data/Hora:* ${dataHoraPedido}\n`;
    mensagem += `*Cliente:* ${clienteNome}\n`;
    mensagem += `*Telefone:* ${clienteTelefone}\n`;
    if (clienteEmail) {
      mensagem += `*E-mail:* ${clienteEmail}\n`;
    }
    mensagem += tipoEntrega === "retirada" ? "*Retirada no local*\n\n" : `*Endereço:* ${[clienteRua, clienteNumero, clienteBairro, clienteCidade, clienteComplemento].filter(Boolean).join(", ")}\n\n`;
    mensagem += "*Itens do pedido:*\n";

    carrinho.forEach((item) => {
      const unitLabel = item.unit === "kg" ? `${item.quantity}kg` : `${item.quantity}x`;
      const optLabel = item.option ? ` - ${item.option}` : "";
      mensagem += `• ${item.name}${optLabel} - ${unitLabel} — R$ ${formatCurrency(item.subtotal)}\n`;
    });

    if (observacaoCompra) {
      mensagem += `\n*Observações da compra:*\n${observacaoCompra}\n`;
    }

    const valorTotal = getTotal(); // ← NOVO: Guarda o valor antes de limpar
    mensagem += `\n*Total base: R$ ${formatCurrency(valorTotal)}*`;

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensagem)}`;
    totalPedido = valorTotal; // ← NOVO: Armazena o valor global
    window.open(url, '_blank');
    urlWhatsAppPedido = { _url: url, _numeroPedido: numeroPedido };
    limparCarrinho();
    cartStep = "sucesso";
    renderCarrinho();
  };

  const registrarEventosCarrinho = () => {
    if (!listaCarrinho || !cartActionsEl) {
      return;
    }

    listaCarrinho.addEventListener("click", (event) => {
      const botao = event.target.closest("button[data-remove]");
      if (!botao) {
        return;
      }
      const index = Number(botao.getAttribute("data-remove"));
      if (!Number.isNaN(index)) {
        carrinho.splice(index, 1);
        renderCarrinho();
      }
    });

    cartActionsEl.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.id === "btn-iniciar-checkout") {
        iniciarCheckout();
      } else if (target.id === "btn-limpar-carrinho") {
        limparCarrinho();
      } else if (target.id === "btn-voltar-topo") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (target.id === "btn-salvar-nome") {
        const nomeInput = document.getElementById("input-nome");
        const telefoneInput = document.getElementById("input-telefone");
        const emailInput = document.getElementById("input-email");
        clienteNome = nomeInput ? nomeInput.value.trim() : "";
        clienteTelefone = telefoneInput ? telefoneInput.value.trim() : "";
        clienteEmail = emailInput ? emailInput.value.trim() : "";
        if (!clienteNome) {
          alert("Por favor, informe seu nome.");
          return;
        }
        if (!clienteTelefone) {
          alert("Por favor, informe seu telefone.");
          return;
        }
        if (clienteTelefone.replace(/\D/g, "").length < 8) {
          alert("Telefone inválido. Informe apenas números (mínimo 8 dígitos).");
          return;
        }
        cartStep = "tipo";
        renderCarrinho();
      } else if (target.id === "btn-voltar-cart") {
        cartStep = "cart";
        renderCarrinho();
      } else if (target.id === "btn-retirada") {
        escolherRetirada();
      } else if (target.id === "btn-entrega") {
        escolherEntrega();
      } else if (target.id === "btn-voltar-nome") {
        cartStep = "nome";
        renderCarrinho();
      } else if (target.id === "btn-salvar-endereco") {
        clienteRua = (document.getElementById("input-rua")?.value || "").trim();
        clienteNumero = (document.getElementById("input-numero")?.value || "").trim();
        clienteBairro = (document.getElementById("input-bairro")?.value || "").trim();
        clienteCidade = (document.getElementById("input-cidade")?.value || "").trim();
        clienteComplemento = (document.getElementById("input-complemento")?.value || "").trim();
        if (!clienteRua || !clienteNumero || !clienteBairro || !clienteCidade) {
          alert("Por favor, preencha Rua, Número, Bairro e Cidade.");
          return;
        }
        clienteEndereco = [clienteRua, clienteNumero, clienteBairro, clienteCidade, clienteComplemento].filter(Boolean).join(", ");
        cartStep = "confirmar";
        renderCarrinho();
      } else if (target.id === "btn-voltar-tipo") {
        cartStep = "tipo";
        renderCarrinho();
      } else if (target.id === "btn-enviar-whatsapp") {
        await enviarWhatsApp();
      } else if (target.id === "btn-fechar-sucesso") {
        urlWhatsAppPedido = "";
        if (carrinhoContainer) carrinhoContainer.style.display = "none";
      } else if (target.id === "btn-voltar-confirmar") {
        voltarConfirmar();
      }
    });
  };

  // Mostrar/ocultar carrinho ao clicar no ícone
  const iconeCarrinho = document.querySelector(".carrinho img");
  if (iconeCarrinho && carrinhoContainer) {
    iconeCarrinho.addEventListener("click", () => {
      carrinhoContainer.style.display = carrinhoContainer.style.display === "block" ? "none" : "block";
      if (carrinhoContainer.style.display === "block") {
        renderCarrinho();
      }
    });
  }

  // Botão fixo para levar usuário ao carrinho/finalização
  if (btnCarrinhoFixo && carrinhoContainer) {
    btnCarrinhoFixo.addEventListener("click", () => {
      carrinhoContainer.style.display = "block";
      carrinhoContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderCarrinho();
    });
  }

  // Adicionar produto
  const bindBuyButton = (btn) => {
    if (!btn || btn.dataset.boundBuy === "1") {
      return;
    }

    btn.dataset.boundBuy = "1";

    btn.addEventListener("click", async () => {
      const produto = btn.closest(".produto");
      if (!produto || !listaCarrinho) {
        return;
      }

      const nome = produto.querySelector("h3").innerText;
      const precoTexto = produto.querySelector(".preco").innerText;
      const precoNumero = parsePrice(precoTexto);
      const selectCorte = produto.querySelector("select");
      const inputPeso = produto.querySelector("input[type='number']");
      const corte = selectCorte ? selectCorte.value : "Sem seleção";

      const isKg = /\/\s*kg/i.test(precoTexto) || Boolean(inputPeso);
      const unit = isKg ? "kg" : "un";

      let quantidade = 1;
      if (inputPeso) {
        const peso = inputPeso.value;

        if (!peso || isNaN(peso) || Number(peso) <= 0) {
          alert("Informe um peso válido (número positivo) antes de adicionar ao carrinho.");
          return;
        }

        quantidade = Number(peso);
      }

      const productId = produto.getAttribute("data-product-id")
        ? Number(produto.getAttribute("data-product-id"))
        : null;

      if (productId && API_ENABLED) {
        try {
          const respEstoque = await fetch(`${API_BASE_URL}/estoque/${productId}`);
          const dadosEstoque = await respEstoque.json().catch(() => ({}));

          if (!respEstoque.ok) {
            alert("Não foi possível validar o estoque deste item agora. Tente novamente.");
            return;
          }

          const qtdDisponivel = Number(dadosEstoque?.estoque?.quantidade ?? 0);
          const qtdJaNoCarrinho = carrinho
            .filter((item) => Number(item.productId) === productId)
            .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

          if (!Number.isFinite(qtdDisponivel) || qtdJaNoCarrinho + quantidade > qtdDisponivel) {
            alert(`Quantidade acima do estoque para ${nome}. Disponível: ${qtdDisponivel}kg.`);
            return;
          }
        } catch (error) {
          alert("Não foi possível consultar o estoque deste item. Tente novamente.");
          return;
        }
      }

      carrinho.push({
        name: nome,
        option: corte === "Sem seleção" ? "" : corte,
        quantity: quantidade,
        unit,
        price: precoNumero,
        subtotal: quantidade * precoNumero,
        productId,
      });

      renderCarrinho();

      btn.textContent = "✔ Adicionado!";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = "Adicionar ao Carrinho";
        btn.disabled = false;
      }, 1200);

      if (inputPeso) {
        inputPeso.value = "";
      }
    });
  };

  document.querySelectorAll(".btn-comprar").forEach(bindBuyButton);

  const btnVoltar = document.getElementById("btn-voltar");
  if (btnVoltar) {
    btnVoltar.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  inicializarCarrinhoUI();
  registrarEventosCarrinho();
  renderCarrinho();

  bootstrapProductSync();

  const galeria = document.querySelector(".galeria-internas");
  if (galeria) {
    const imagens = Array.from(galeria.querySelectorAll(".slider-image"));
    const btnPrev = galeria.querySelector(".slider-btn.prev");
    const btnNext = galeria.querySelector(".slider-btn.next");

    if (imagens.length > 0) {
      let indiceAtual = 0;
      let intervalo = null;

      const mostrarSlide = (novoIndice) => {
        imagens[indiceAtual].classList.remove("ativo");
        indiceAtual = (novoIndice + imagens.length) % imagens.length;
        imagens[indiceAtual].classList.add("ativo");
      };

      const iniciarAutoSlide = () => {
        clearInterval(intervalo);
        intervalo = setInterval(() => {
          mostrarSlide(indiceAtual + 1);
        }, 3000);
      };

      if (btnPrev) {
        btnPrev.addEventListener("click", () => {
          mostrarSlide(indiceAtual - 1);
          iniciarAutoSlide();
        });
      }

      if (btnNext) {
        btnNext.addEventListener("click", () => {
          mostrarSlide(indiceAtual + 1);
          iniciarAutoSlide();
        });
      }

      iniciarAutoSlide();
    }
  }
})();