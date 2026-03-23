// ═══════════════════════════════════════════════════════════════════
// api.js — Integração Frontend → Railway Backend + Supabase
// Substitui o localStorage quando o backend estiver configurado
// Salve este arquivo na mesma pasta do pao_no_frio.html
// ═══════════════════════════════════════════════════════════════════

const PNF_API = (function() {

  // ── CONFIGURAÇÃO ───────────────────────────────────────────────
  // Preencha após criar seus serviços:
  const CONFIG = {
    // URL do backend no Railway (ex: https://pao-no-frio-backend.up.railway.app)
    BACKEND_URL: '',
    // Chave secreta — deve ser igual ao API_SECRET no .env do Railway
    API_KEY: '',
    // true = usa Railway+Supabase | false = usa localStorage (modo offline)
    MODO_ONLINE: false
  };

  // ── HELPERS ────────────────────────────────────────────────────
  async function req(method, path, body) {
    const resp = await fetch(CONFIG.BACKEND_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.API_KEY
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ erro: resp.statusText }));
      throw new Error(err.erro || 'Erro na requisição');
    }
    return resp.json();
  }

  function converterPedidoSupabase(p) {
    // Converter formato Supabase → formato localStorage atual
    const pag = p.pagamentos?.[0] || {};
    return {
      _id:       p.id,
      noteNum:   p.note_num,
      data:      p.data,
      cliente:   p.cliente,
      pagamento: p.pagamento,
      dataPrazo: p.data_prazo || '',
      total:     parseFloat(p.total),
      itens:     typeof p.itens === 'string' ? JSON.parse(p.itens) : (p.itens || []),
      _pag: {
        status:         pag.status || 'aberto',
        valorPago:      parseFloat(pag.valor_pago || 0),
        dataPagamento:  pag.data_pagamento || '',
        historico:      pag.historico || []
      }
    };
  }

  // ── API PÚBLICA ─────────────────────────────────────────────────
  return {

    // Verificar se o modo online está ativo e o backend configurado
    isOnline() {
      return CONFIG.MODO_ONLINE && CONFIG.BACKEND_URL && CONFIG.API_KEY;
    },

    // Configurar (chamar após carregar a página)
    configurar(backendUrl, apiKey) {
      CONFIG.BACKEND_URL = backendUrl;
      CONFIG.API_KEY = apiKey;
      CONFIG.MODO_ONLINE = !!(backendUrl && apiKey);
      console.log('[PNF API] Modo:', CONFIG.MODO_ONLINE ? 'ONLINE ✅' : 'OFFLINE (localStorage)');
    },

    // ── PEDIDOS ──────────────────────────────────────────────────

    async salvarPedido(pedido) {
      if (!this.isOnline()) {
        // Fallback: localStorage
        const key = 'pnf_pedidos_v2';
        const todos = JSON.parse(localStorage.getItem(key) || '[]');
        todos.push(pedido);
        localStorage.setItem(key, JSON.stringify(todos));
        return pedido;
      }
      const resultado = await req('POST', '/pedidos', {
        cliente:    pedido.cliente,
        pagamento:  pedido.pagamento,
        data_prazo: pedido.dataPrazo || null,
        data:       pedido.data,
        itens:      pedido.itens,
        origem:     'manual'
      });
      return resultado.pedido;
    },

    async carregarTodosPedidos(filtros = {}) {
      if (!this.isOnline()) {
        const raw = localStorage.getItem('pnf_pedidos_v2');
        return raw ? JSON.parse(raw) : [];
      }
      const params = new URLSearchParams();
      if (filtros.de)      params.set('de', filtros.de);
      if (filtros.ate)     params.set('ate', filtros.ate);
      if (filtros.cliente) params.set('cliente', filtros.cliente);
      const pedidos = await req('GET', '/pedidos?' + params.toString());
      return pedidos.map(converterPedidoSupabase);
    },

    async marcarPago(pedidoId, valorParcial) {
      if (!this.isOnline()) {
        // Fallback localStorage — já implementado na ferramenta
        return;
      }
      return req('PATCH', `/pedidos/${pedidoId}/pagar`,
        valorParcial ? { valor_parcial: valorParcial } : {}
      );
    },

    // ── CLIENTES ─────────────────────────────────────────────────

    async carregarClientes() {
      if (!this.isOnline()) {
        const extras = JSON.parse(localStorage.getItem('pnf_clientes_v2') || '[]');
        return window.CLIENTES_DB ? window.CLIENTES_DB.concat(extras) : extras;
      }
      return req('GET', '/clientes');
    },

    async adicionarCliente(dados) {
      if (!this.isOnline()) {
        const extras = JSON.parse(localStorage.getItem('pnf_clientes_v2') || '[]');
        const novo = { id: 'cx_' + Date.now(), ...dados };
        extras.push(novo);
        localStorage.setItem('pnf_clientes_v2', JSON.stringify(extras));
        return novo;
      }
      return req('POST', '/clientes', dados);
    },

    // ── WHATSAPP MANUAL ───────────────────────────────────────────

    async enviarWhatsApp(mensagem) {
      if (!this.isOnline()) {
        console.log('[WhatsApp] Modo offline — mensagem não enviada:', mensagem);
        return;
      }
      return req('POST', '/whatsapp/enviar', { mensagem, tipo: 'texto' });
    },

    // ── SINCRONIZAR localStorage → Supabase ──────────────────────

    async sincronizarLocalStorage() {
      if (!this.isOnline()) return { sincronizados: 0 };

      const pedidosLocal = JSON.parse(localStorage.getItem('pnf_pedidos_v2') || '[]');
      if (!pedidosLocal.length) return { sincronizados: 0 };

      let count = 0;
      for (const p of pedidosLocal) {
        try {
          await req('POST', '/pedidos', {
            cliente:    p.cliente,
            pagamento:  p.pagamento,
            data_prazo: p.dataPrazo || null,
            data:       p.data,
            itens:      p.itens,
            origem:     'sync_local'
          });
          count++;
        } catch (e) {
          console.warn('[Sync] Pedido ignorado (duplicado?):', p.noteNum);
        }
      }

      console.log(`[Sync] ${count} pedidos sincronizados para o Supabase`);
      return { sincronizados: count };
    }
  };
})();

// ── AUTO-INICIALIZAR se variáveis globais existirem ───────────────
// Você pode definir essas variáveis em uma tag <script> antes de carregar api.js:
// window.PNF_BACKEND_URL = 'https://seu-backend.up.railway.app';
// window.PNF_API_KEY = 'sua_chave_secreta';
if (window.PNF_BACKEND_URL && window.PNF_API_KEY) {
  PNF_API.configurar(window.PNF_BACKEND_URL, window.PNF_API_KEY);
}
