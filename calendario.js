/* Calendário de publicações do Instagram · Agenda Tanyno
   Posts: data.json (chave "instagram"), gerado a partir da planilha do cronograma.
   Eventos e aprovações: Supabase (config.js). Sem Supabase, mostra só os posts. */
(function () {
  "use strict";

  const TZ = "America/Sao_Paulo";
  const MES_MIN = "2026-11";
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const TIPOS = { "Data comemorativa": "🎉", "Lançamento": "🍷", "Evento Tanyno": "⭐", "Reunião": "👥", "Post extra": "➕", "Outro": "📌" };
  const CONTAS_EV = { Ambas: "Ambas as contas", Oficial: "Tanyno Oficial", Glass: "Tanyno Glass", Mililitros: "Mililitros", Interno: "Interno" };
  const CONTA_NOME = { Oficial: "Tanyno Oficial", Glass: "Tanyno Glass" };
  // listas iguais às do SQL (tabela solicitacoes)
  const SOL_TIPOS = ["Card feed", "Stories", "Reels", "Carrossel", "Catálogo", "Site", "Material comercial", "Vídeo", "Outro"];
  const SOL_MARCAS = ["Tanyno", "Tanyno Glass", "Mililitros", "Interno"];
  const SOL_URG = ["Alta", "Média", "Baixa"];
  const SOL_CAMPOS = [["objetivo", "Objetivo e público"], ["briefing", "Briefing"], ["texto_aprovado", "Texto aprovado"],
    ["formatos", "Formatos e tamanhos"], ["produtos", "Vinhos e produtos"], ["links", "Links de referência e arquivos"], ["observacoes", "Observações"]];

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_");
  const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const partes = d => { const [y, m, dd] = d.split("-").map(Number); return { y, m, d: dd, w: new Date(y, m - 1, dd).getDay() }; };
  const extenso = d => { const p = partes(d); return `${DIAS[p.w]}, ${p.d} de ${MESES[p.m - 1]}`; };
  const mesNome = ym => { const [y, m] = ym.split("-").map(Number); return `${MESES[m - 1]} de ${y}`; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const addMes = (ym, n) => { let [y, m] = ym.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
  const quando = ts => {
    try {
      const f = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ts));
      const g = t => (f.find(x => x.type === t) || {}).value;
      return `${g("day")}/${g("month")} às ${g("hour")}:${g("minute")}`;
    } catch (e) { return ""; }
  };

  /* ---------- dados compartilhados (Supabase, ou memória no modo demonstração) ---------- */
  const Store = {
    mode: "off", erro: "", user: null, aprov: [], eventos: [], sols: [], edicoes: [], vinculos: [], anexos: [], client: null,

    async init() {
      const q = new URLSearchParams(location.search);
      if (q.get("demo") === "1" || q.get("demo") === "anon") {
        this.mode = "demo";
        this.user = q.get("demo") === "anon" ? null : { email: "", nome: "Demonstração", permitido: true, gestor: true };
        this.eventos = [{ id: "demo-1", data: "2026-11-27", titulo: "Black Friday", tipo: "Data comemorativa", conta: "Ambas", descricao: "Exemplo do modo demonstração.", criado_por: "Demonstração", criado_em: new Date().toISOString() }];
        return;
      }
      // erro devolvido pelo link do e-mail (link expirado, endereço não autorizado...)
      const h = new URLSearchParams(location.hash.replace(/^#/, ""));
      const qe = new URLSearchParams(location.search);
      const desc = h.get("error_description") || qe.get("error_description");
      if (desc) this.authErro = desc.replace(/\+/g, " ");
      const c = window.AGENDA_CONFIG || {};
      if (!c.SUPABASE_URL || !c.SUPABASE_ANON_KEY) { this.mode = "off"; this.erro = "config"; return; }
      if (!window.supabase || !window.supabase.createClient) { this.mode = "off"; this.erro = "rede"; return; }
      try {
        this.client = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
        });
        const { data } = await this.client.auth.getSession();
        await this.setSession(data && data.session);
        this.client.auth.onAuthStateChange((_ev, s) => {
          setTimeout(() => this.setSession(s).then(() => this.refresh()).catch(e => console.warn(e)).then(notify), 0);
        });
        await this.refresh();
        this.mode = "supabase"; this.erro = "";
      } catch (e) {
        console.warn("Supabase indisponível", e);
        this.mode = "off"; this.erro = "rede";
      }
    },

    async setSession(s) {
      if (!s || !s.user) { this.user = null; return; }
      const u = { email: s.user.email, nome: null, permitido: false };
      try {
        const { data, error } = await this.client.rpc("meu_nome");
        if (!error && data) { u.nome = data; u.permitido = true; }
        if (u.permitido) { const g = await this.client.rpc("posso_aceitar"); u.gestor = !g.error && g.data === true; }
      } catch (e) { /* sem permissão ou fora do ar */ }
      this.user = u;
    },

    async refresh() {
      if (this.mode === "demo") return;
      // sem acesso o banco recusa a leitura (só e-mails permitidos leem): nada a buscar
      if (!(this.user && this.user.permitido)) { this.aprov = []; this.eventos = []; this.sols = []; this.edicoes = []; this.vinculos = []; this.anexos = []; return; }
      const [a, e] = await Promise.all([
        this.client.from("aprovacoes").select("*").order("criado_em", { ascending: false }),
        this.client.from("eventos").select("*").order("data", { ascending: true })
      ]);
      if (a.error) throw a.error;
      if (e.error) throw e.error;
      this.aprov = a.data || [];
      this.eventos = e.data || [];
      this.sols = [];
      if (this.user && this.user.permitido) { // briefing só para quem tem acesso
        const s = await this.client.from("solicitacoes").select("*").order("criado_em", { ascending: false });
        if (!s.error) this.sols = s.data || [];
        // edições das demandas ainda não aplicadas na planilha (o site mostra por cima)
        const ed = await this.client.from("edicoes_demandas").select("*").eq("aplicada", false).order("criado_em", { ascending: true });
        this.edicoes = ed.error ? [] : ed.data || [];
        const vi = await this.client.from("vinculos_demandas").select("*");
        this.vinculos = vi.error ? [] : vi.data || [];
        const ax = await this.client.from("anexos").select("*").order("criado_em", { ascending: true });
        this.anexos = ax.error ? [] : ax.data || [];
      }
    },

    async carregaAgenda() { // o antigo data.json; no modo demonstração vem do arquivo local de teste
      if (this.mode === "demo") {
        const r = await fetch("data.json", { cache: "no-store" });
        if (!r.ok) throw new Error("data.json " + r.status);
        return r.json();
      }
      const { data, error } = await this.client.from("agenda_dados").select("dados").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("agenda vazia");
      return data.dados;
    },

    async decide(id, decisao, dataPub) { // só quem aceita demandas (o banco confere de novo)
      if (this.mode === "demo") {
        const x = this.sols.find(s => String(s.id) === String(id));
        if (x) Object.assign(x, { situacao: decisao, data_publicacao: decisao === "aceita" ? dataPub || null : null, decidido_por: this.user.nome });
        return;
      }
      const { error } = await this.client.rpc("decide_solicitacao", { sol: id, decisao, data_pub: dataPub || null });
      if (error) throw error;
      await this.refresh();
    },

    // arquivos dos posts e eventos (espaço privado "anexos" do Supabase)
    async urlsAnexos(lista) {
      if (this.mode === "demo") return Object.fromEntries(lista.map(a => [a.caminho, a._url]));
      const { data, error } = await this.client.storage.from("anexos").createSignedUrls(lista.map(a => a.caminho), 3600);
      if (error) throw error;
      return Object.fromEntries((data || []).map(d => [d.path, d.signedUrl]));
    },
    async subirAnexo(tipo, alvo, file) {
      const ext = ((file.name.match(/\.[A-Za-z0-9]+$/) || [""])[0]).toLowerCase();
      const caminho = `${tipo}/${slug(alvo)}/${Date.now()}-${slug(file.name.replace(/\.[^.]+$/, "")).slice(0, 60)}${ext}`;
      const row = { tipo, alvo: String(alvo), caminho, nome: file.name, mime: file.type, tamanho: file.size };
      if (this.mode === "demo") {
        this.anexos.push(Object.assign({ id: "x" + Date.now() + Math.random(), _url: URL.createObjectURL(file), criado_em: new Date().toISOString() }, row));
        return;
      }
      const up = await this.client.storage.from("anexos").upload(caminho, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await this.client.from("anexos").insert(row);
      if (error) { await this.client.storage.from("anexos").remove([caminho]); throw error; }
    },
    async apagarAnexo(a) {
      if (this.mode === "demo") { this.anexos = this.anexos.filter(x => x.id !== a.id); return; }
      const rm = await this.client.storage.from("anexos").remove([a.caminho]);
      if (rm.error) throw rm.error;
      const { error } = await this.client.from("anexos").delete().eq("id", a.id);
      if (error) throw error;
      await this.refresh();
    },

    // demanda ligada a um post ou evento do calendário
    async addVinculo(v) {
      if (this.mode === "demo") { this.vinculos.push(Object.assign({ id: "v" + Date.now() }, v)); return; }
      const { error } = await this.client.from("vinculos_demandas").insert(v);
      if (error) throw error;
      await this.refresh();
    },
    async delVinculo(id) {
      if (this.mode === "demo") { this.vinculos = this.vinculos.filter(v => v.id !== id); return; }
      const { error } = await this.client.from("vinculos_demandas").delete().eq("id", id);
      if (error) throw error;
    },
    async updVinculo(id, campos) {
      if (this.mode === "demo") { Object.assign(this.vinculos.find(v => v.id === id) || {}, campos); return; }
      const { error } = await this.client.from("vinculos_demandas").update(campos).eq("id", id);
      if (error) throw error;
    },

    async addEdicoes(lista) { // [{linha, demanda, campo, valor}]
      if (!lista.length) return;
      if (this.mode === "demo") {
        lista.forEach((e, i) => this.edicoes.push(Object.assign({ id: "e" + Date.now() + i, criado_por: this.user.nome, criado_em: new Date().toISOString(), aplicada: false }, e)));
        return;
      }
      const { error } = await this.client.from("edicoes_demandas").insert(lista);
      if (error) throw error;
      await this.refresh();
    },

    async addSolicitacao(campos) {
      if (this.mode === "demo") {
        this.sols.unshift(Object.assign({ id: "s" + Date.now(), criado_por: this.user.nome, criado_em: new Date().toISOString() }, campos));
        return;
      }
      const { error } = await this.client.from("solicitacoes").insert(campos);
      if (error) throw error;
      await this.refresh();
    },

    decisao(id) { const a = this.aprov.find(x => x.post_id === id); return a ? a.decisao : null; },
    historico(id) { return this.aprov.filter(x => x.post_id === id); },
    pode() { return this.mode !== "off" && !!(this.user && this.user.permitido); },

    async addAprov(post_id, decisao, comentario) {
      if (this.mode === "demo") {
        this.aprov.unshift({ id: "a" + Date.now(), post_id, decisao, comentario, autor: this.user.nome, criado_em: new Date().toISOString() });
        return;
      }
      const { error } = await this.client.from("aprovacoes").insert({ post_id, decisao, comentario });
      if (error) throw error;
      await this.refresh();
    },

    async saveEvento(ev) {
      const campos = { data: ev.data, titulo: ev.titulo, tipo: ev.tipo, conta: ev.conta, descricao: ev.descricao };
      if (!ev.id && ev.demanda) campos.demanda = ev.demanda;     // nasceu de uma demanda aceita
      if (this.mode === "demo") {
        if (ev.id) Object.assign(this.eventos.find(x => x.id === ev.id), campos);
        else {
          const id = "e" + Date.now() + Math.floor(Math.random() * 1000);
          this.eventos.push(Object.assign({ id, criado_por: this.user.nome, criado_em: new Date().toISOString() }, campos));
          if (ev.demanda) this.vinculos.push({ id: "v" + id, linha: 0, demanda: ev.demanda, tipo: "evento", evento_id: id, publicacao: true });
          else {                                                   // como o gatilho do banco: demanda aceita ligada ao evento
            const sid = "s" + id, marca = { Glass: "Tanyno Glass", Interno: "Interno", Mililitros: "Mililitros" }[ev.conta] || "Tanyno";
            this.sols.push({ id: sid, titulo: ev.titulo, tipo: "Outro", marca, prazo: ev.data, urgencia: "Média", briefing: `Evento do calendário (${ev.tipo}).`,
              situacao: "aceita", na_planilha: false, criado_por: this.user.nome, criado_em: new Date().toISOString(), evento_id: id });
            this.vinculos.push({ id: "v" + id, linha: 0, demanda: "sol:" + sid, tipo: "evento", evento_id: id, publicacao: false });
          }
        }
        this.eventos.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
        return;
      }
      const r = ev.id
        ? await this.client.from("eventos").update(campos).eq("id", ev.id)
        : await this.client.from("eventos").insert(campos);
      if (r.error) throw r.error;
      await this.refresh();
    },

    async delEvento(id) {
      if (this.mode === "demo") { this.eventos = this.eventos.filter(x => x.id !== id); return; }
      const { error } = await this.client.from("eventos").delete().eq("id", id);
      if (error) throw error;
      await this.refresh();
    },

    async signIn(email, senha) {
      if (this.mode === "demo") { this.user = { email, nome: "Demonstração", permitido: true, gestor: true }; setTimeout(notify, 0); return; }
      const { error } = await this.client.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(/invalid login|credentials/i.test(error.message) ? "E-mail ou senha incorretos." : error.message);
    },

    async signOut() {
      this.sols = [];
      if (this.mode === "demo") { this.user = null; return; }
      await this.client.auth.signOut();
      this.user = null;
    }
  };

  /* ---------- estado do calendário ---------- */
  const Cal = { posts: [], anivs: [], empresa: [], mes: null, conta: "Todas", root: null, dlg: null, aberto: null, ultimoFoco: null };

  const mesMax = () => addMes(hojeSP().slice(0, 7), 12); // o calendário vai só até 12 meses à frente
  const clampMes = ym => ym < MES_MIN ? MES_MIN : ym > mesMax() ? mesMax() : ym;
  const filtraConta = c => Cal.conta === "Todas" || c === Cal.conta;
  // publicação aceita pelo site que a rotina ainda não pôs no cronograma: aparece já, como provisória, no dia escolhido
  // edição mais nova de um campo da provisória (feita na tabela de Demandas)
  const edSol = (id, campo) => { const l = Store.edicoes.filter(e => e.demanda === "sol:" + id && e.campo === campo); return l.length ? l[l.length - 1].valor : null; };
  const provisorios = () => Store.sols
    .filter(s => s.situacao === "aceita" && !s.na_planilha && s.data_publicacao && ehPost(s) && !edSol(s.id, "excluir"))
    .map(s => ({ id: "sol-" + s.id, sol: s.id, provisorio: true, conta: s.marca === "Tanyno" ? "Oficial" : "Glass",
      data: String(s.data_publicacao).slice(0, 10), formato: FORMATO[s.tipo], tema: edSol(s.id, "demanda") || s.titulo, ideia: s.briefing,
      rotulo: s.produtos || "", gancho: "", cta: "", status: "Produzindo" }))
    .filter(v => !Cal.posts.some(p => p.conta === v.conta && p.data === v.data && p.tema === v.tema));
  // post movido pelo site (prazo da demanda ligada mudou): aparece já no dia novo, até a rotina mover no cronograma
  const chavePost = p => `post:${p.conta}|${p.data}|${p.id}|${p.tema}`;
  const movidoPara = p => { const k = chavePost(p), l = Store.edicoes.filter(e => e.campo === "mover_post" && e.demanda === k); return l.length ? l[l.length - 1].valor : null; };
  const excluidoPost = p => Store.edicoes.some(e => e.campo === "excluir_post" && e.demanda === chavePost(p));
  const AJ_CAMPOS = ["formato", "tema", "ideia", "gancho", "rotulo", "cta"];
  const ajustesPost = p => { const k = chavePost(p), o = {};
    Store.edicoes.forEach(e => { if (e.demanda === k && e.campo.startsWith("post_")) o[e.campo.slice(5)] = e.valor; }); return o; };
  const todosPosts = () => Cal.posts.concat(provisorios()).filter(p => !excluidoPost(p)).map(p => {
    const n = movidoPara(p);
    return Object.assign({}, p, ajustesPost(p), { base: { data: p.data, id: p.id, tema: p.tema } }, n ? { data: n } : {});
  });
  // vínculo guarda o tema de quando foi ligado; o post pode ter o tema ajustado e ainda não escrito no cronograma
  const casaVinc = (v, p) => v.tipo === "post" && v.conta === p.conta && String(v.data).slice(0, 10) === p.data && (v.tema === p.tema || v.tema === (p.base || p).tema);
  const postsMes = () => todosPosts().filter(p => p.data.slice(0, 7) === Cal.mes && filtraConta(p.conta))
    .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  const eventosMes = () => Store.eventos.filter(e => String(e.data).slice(0, 7) === Cal.mes &&
    (Cal.conta === "Todas" || e.conta === Cal.conta || e.conta === "Ambas" || e.conta === "Interno" || e.conta === "Mililitros"));

  function pendentes() {
    if (Store.mode === "off") return null;
    const t = hojeSP();
    return Cal.posts.filter(p => p.data >= t && !Store.decisao(p.id)).length;
  }

  /* ---------- peças de HTML ---------- */
  const stPill = s => s ? `<span class="stp st-${slug(s)}">${esc(s)}</span>` : "";
  function selo(dec) {
    if (Store.mode === "off") return "";
    if (dec === "aprovado") return `<span class="selo s-ok">✅ Aprovado</span>`;
    if (dec === "ajustar") return `<span class="selo s-aj">✏️ Ajustar</span>`;
    return `<span class="selo s-wait">⏳ Aguardando</span>`;
  }
  const ctag = (conta, nome) => `<span class="ctag c-${esc(conta)}">${esc(nome || conta)}</span>`;
  const addBtn = d => Store.mode === "off" ? "" :
    `<button type="button" class="cd-add" data-cal-add="${d}" aria-label="Adicionar evento em ${extenso(d)}" title="Adicionar evento">+</button>`;
  const evChip = e => `<button type="button" class="evchip" data-cal-ev="${esc(e.id)}"><span aria-hidden="true">${TIPOS[e.tipo] || "📌"}</span><span class="evchip-t">${esc(e.titulo)}</span>${anexosDe("evento", e.id).length ? `<span aria-label="tem arquivos">📎</span>` : ""}</button>`;
  // ---------- arquivos ----------
  const ANX_TIPOS = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm", "application/pdf"];
  const anexosDe = (tipo, alvo) => Store.anexos.filter(a => a.tipo === tipo && String(a.alvo) === String(alvo));
  function htmlAnexos(tipo, alvo) {
    const n = anexosDe(tipo, alvo).length, g = !!(Store.user && Store.user.gestor);
    if (!n && !g) return "";
    return `<section class="anx" data-anx data-anx-tipo="${tipo}" data-anx-alvo="${esc(alvo)}" aria-label="Arquivos"><h4>Arquivos${n ? ` <span class="muted">${n}</span>` : ""}</h4>
      <div class="anx-l" data-anx-l>${n ? `<p class="muted small">Carregando…</p>` : `<p class="muted small">Nenhum arquivo ainda.</p>`}</div>
      ${g ? `<label class="btn-sec anx-add">Adicionar arquivos<input type="file" multiple accept="image/*,video/*,application/pdf" data-anx-input></label>
        <p class="form-msg" data-anx-msg role="status"></p>` : ""}</section>`;
  }
  async function preencheAnexos() {
    const sec = Cal.dlg && Cal.dlg.querySelector("[data-anx]");
    if (!sec) return;
    const lista = anexosDe(sec.dataset.anxTipo, sec.dataset.anxAlvo), box = sec.querySelector("[data-anx-l]");
    if (!lista.length) return;
    let urls;
    try { urls = await Store.urlsAnexos(lista); } catch (e) { box.innerHTML = `<p class="muted small">Não foi possível abrir os arquivos agora.</p>`; return; }
    const g = !!(Store.user && Store.user.gestor);
    Cal.pvLista = lista; Cal.pvUrls = urls;
    box.innerHTML = lista.map((a, i) => {
      const u = esc(urls[a.caminho] || ""), nome = esc(a.nome);
      const mini = a.mime.startsWith("image/") ? `<img src="${u}" alt="" loading="lazy">`
        : a.mime.startsWith("video/") ? `<video src="${u}#t=0.1" preload="metadata" muted playsinline tabindex="-1"></video><span class="anx-play" aria-hidden="true">▶</span>`
        : `<span class="anx-doc" aria-hidden="true">PDF</span>`;
      return `<figure class="anx-i"><button type="button" class="anx-th" data-pv-ir="${i}" aria-label="Ver ${nome}" title="${nome}">${mini}</button>${g ? `<button type="button" class="anx-x" data-anx-del="${esc(a.id)}" aria-label="Apagar ${nome}" title="Apagar">✕</button>` : ""}</figure>`;
    }).join("");
    desenhaMidia();
  }
  // arquivo em destaque à esquerda da janela: imagem inteira, vídeo tocando ali, PDF aberto
  function desenhaMidia() {
    const box = Cal.dlg && Cal.dlg.querySelector("[data-pv]"), l = Cal.pvLista || [];
    if (!box || !l.length) return;
    const n = l.length, i = Cal.pvI = Math.min(Cal.pvI || 0, n - 1), a = l[i], u = esc(Cal.pvUrls[a.caminho] || ""), nome = esc(a.nome);
    const corpo = a.mime.startsWith("image/") ? `<img src="${u}" alt="${nome}">`
      : a.mime.startsWith("video/") ? `<video src="${u}" controls playsinline preload="metadata" aria-label="${nome}"></video>`
      : `<object data="${u}#view=FitH" type="application/pdf" aria-label="${nome}"><a class="pv-doc" href="${u}" target="_blank" rel="noopener"><span aria-hidden="true">PDF</span>${nome}</a></object>`;
    box.innerHTML = `<div class="pv-c">${corpo}</div>
      ${n > 1 ? `<span class="pv-n">${i + 1} / ${n}</span>
        <button type="button" class="pv-seta pv-ant" data-pv-ir="${(i - 1 + n) % n}" aria-label="Arquivo anterior">‹</button>
        <button type="button" class="pv-seta pv-prox" data-pv-ir="${(i + 1) % n}" aria-label="Próximo arquivo">›</button>
        <div class="pv-dots">${l.map((x, j) => `<button type="button" data-pv-ir="${j}" aria-label="Arquivo ${j + 1}"${j === i ? ` aria-current="true"` : ""}></button>`).join("")}</div>` : ""}
      <a class="pv-abrir" href="${u}" target="_blank" rel="noopener">Abrir ↗</a>`;
    Cal.dlg.querySelectorAll(".anx-th").forEach((b, j) => b.classList.toggle("on", j === i));
  }
  async function subirArquivos(inp) {
    const sec = inp.closest("[data-anx]"), msg = sec.querySelector("[data-anx-msg]"), files = [...inp.files];
    const ruins = files.filter(f => !ANX_TIPOS.includes(f.type) || f.size > 50 * 1024 * 1024), bons = files.filter(f => !ruins.includes(f));
    const aviso = ruins.length ? `Não dá para subir ${ruins.map(f => f.name).join(", ")}: só imagem, vídeo ou PDF de até 50 MB.` : "";
    if (!bons.length) { msg.textContent = aviso; inp.value = ""; return; }
    inp.disabled = true;
    try {
      for (let i = 0; i < bons.length; i++) { msg.textContent = `Enviando ${i + 1} de ${bons.length}…`; await Store.subirAnexo(sec.dataset.anxTipo, sec.dataset.anxAlvo, bons[i]); }
      if (Store.mode !== "demo") await Store.refresh();
      notify();
      const m2 = Cal.dlg && Cal.dlg.querySelector("[data-anx-msg]");
      if (m2) m2.textContent = aviso;
    } catch (e) { msg.textContent = "Não foi possível enviar: " + (e.message || e); inp.disabled = false; }
  }
  // prévia quadrada da 1ª imagem do post no card do calendário (link assinado guardado até perto de vencer)
  async function preencheMinis() {
    const imgs = [...(Cal.root ? Cal.root.querySelectorAll("[data-mini]") : [])];
    if (!imgs.length) return;
    Cal.minis = Cal.minis || {};
    const agora = Date.now(), falta = [...new Set(imgs.map(i => i.dataset.mini))].filter(c => !(Cal.minis[c] && Cal.minis[c].ate > agora));
    if (falta.length) {
      try {
        const urls = await Store.urlsAnexos(falta.map(c => Store.anexos.find(a => a.caminho === c) || { caminho: c }));
        falta.forEach(c => { if (urls[c]) Cal.minis[c] = { url: urls[c], ate: agora + 50 * 60 * 1000 }; });
      } catch (e) { return; }                       // sem prévia: o card continua com o 📎
    }
    imgs.forEach(i => { const m = Cal.minis[i.dataset.mini], u = m && (i.tagName === "VIDEO" ? m.url + "#t=0.1" : m.url); if (u && i.src !== u) i.src = u; });
  }
  function cardPost(p) {
    // prévia: a 1ª imagem ou vídeo do post (vídeo mostra o primeiro quadro com um play no meio)
    const m = anexosDe("post", (p.base || p).id).find(a => /^(image|video)\//.test(String(a.mime)));
    const mini = !m ? "" : String(m.mime).startsWith("video/")
      ? `<span class="pc-mini"><video data-mini="${esc(m.caminho)}" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true"></video><span class="pc-play" aria-hidden="true"></span></span>`
      : `<span class="pc-mini"><img data-mini="${esc(m.caminho)}" alt="" loading="lazy"></span>`;
    return `<button type="button" class="pcard c-${p.conta}" data-cal-post="${esc(p.id)}">${mini}
      <span class="pc-top"><span class="pc-conta c-${esc(p.conta)}">${esc(p.conta)}</span>${p.formato ? ` · ${esc(p.formato)}` : ""}</span>
      <span class="pc-tema">${esc(p.tema)}</span>
      <span class="pc-bot">${stPill(p.status)}${p.provisorio ? `<span class="selo s-wait">Entra no cronograma</span>` : selo(Store.decisao(p.id))}${(n => n ? `<span class="selo s-anx" title="${n} ${n > 1 ? "arquivos" : "arquivo"}">📎 ${n}</span>` : "")(anexosDe("post", (p.base || p).id).length)}</span></button>`;
  }
  // aniversários (planilha do Drive): "MM-DD" vira a data deste mês; 29/02 cai em 28/02 fora do ano bissexto
  const bissexto = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const anivsMes = () => {
    const [y, m] = Cal.mes.split("-");
    return Cal.anivs.map((a, i) => ({ a, i })).filter(x => x.a.dia.slice(0, 2) === m)
      .map(x => Object.assign(x, { ds: `${y}-${x.a.dia === "02-29" && !bissexto(+y) ? "02-28" : x.a.dia}` }));
  };
  // aniversário de empresa: mesmo mês e dia da entrada, a partir de 1 ano de casa
  const empresaMes = () => {
    const [y, m] = Cal.mes.split("-");
    return Cal.empresa.map((a, i) => ({ a, i, anos: +y - +a.entrada.slice(0, 4) }))
      .filter(x => x.anos >= 1 && x.a.entrada.slice(5, 7) === m)
      .map(x => { const md = x.a.entrada.slice(5); return Object.assign(x, { ds: `${y}-${md === "02-29" && !bissexto(+y) ? "02-28" : md}` }); });
  };
  const anosTanyno = n => `${n} ${n === 1 ? "ano" : "anos"} de Tanyno`;
  const emChip = x => `<button type="button" class="emchip" data-cal-empresa="${x.i}" data-dia="${x.ds}" aria-label="Aniversário de empresa ${esc(x.a.nome)}, ${anosTanyno(x.anos)}"><span aria-hidden="true">🏢</span><span class="em-t"><span class="em-l">Aniversário de empresa</span><b>${esc(x.a.nome)}</b><span class="em-l">${anosTanyno(x.anos)}</span></span></button>`;
  const anChip = x => `<button type="button" class="anchip" data-cal-aniv="${x.i}" data-dia="${x.ds}"><span aria-hidden="true">🎂</span><span class="evchip-t">Aniversário ${esc(x.a.nome)}</span></button>`;
  const nPosts = n => n ? `${n} ${n > 1 ? "posts" : "post"}` : "";

  function htmlCalendario() {
    const ps = postsMes(), evs = eventosMes(), on = Store.mode !== "off", hoje = hojeSP();
    const ap = ps.filter(p => Store.decisao(p.id) === "aprovado").length;
    const aj = ps.filter(p => Store.decisao(p.id) === "ajustar").length;
    const meses = []; for (let m = MES_MIN; m <= mesMax(); m = addMes(m, 1)) meses.push(m);
    const porDia = {};
    ps.forEach(p => (porDia[p.data] = porDia[p.data] || { p: [], e: [], a: [], m: [] }).p.push(p));
    evs.forEach(e => { const d = String(e.data).slice(0, 10); (porDia[d] = porDia[d] || { p: [], e: [], a: [], m: [] }).e.push(e); });
    anivsMes().forEach(x => (porDia[x.ds] = porDia[x.ds] || { p: [], e: [], a: [], m: [] }).a.push(x));
    empresaMes().forEach(x => (porDia[x.ds] = porDia[x.ds] || { p: [], e: [], a: [], m: [] }).m.push(x));

    let aviso = "";
    if (Store.mode === "demo") aviso = "Modo demonstração: aprovações e eventos ficam só neste navegador e somem ao recarregar a página.";
    else if (Store.erro === "config") aviso = "Aprovações e eventos ainda não estão ligados (falta configurar o Supabase). Os posts aparecem normalmente.";
    else if (Store.erro === "rede") aviso = "Aprovações e eventos estão indisponíveis no momento. Os posts aparecem normalmente.";
    else if (Store.authErro && !Store.user) aviso = `O link de acesso não funcionou (${esc(Store.authErro)}). Clique em Entrar e peça um link novo; ele vale por pouco tempo e só uma vez.`;
    else if (Store.user && !Store.user.permitido) aviso = `Você entrou como ${esc(Store.user.email)}, mas este e-mail não tem permissão para aprovar nem criar eventos.`;

    // grade
    const [y, m] = Cal.mes.split("-").map(Number);
    const ini = new Date(y, m - 1, 1).getDay(), nd = new Date(y, m, 0).getDate();
    const cels = [];
    for (let i = 0; i < ini; i++) cels.push(`<div class="cd fora" aria-hidden="true"></div>`);
    for (let d = 1; d <= nd; d++) {
      const ds = `${Cal.mes}-${String(d).padStart(2, "0")}`, x = porDia[ds] || { p: [], e: [], a: [], m: [] };
      cels.push(`<div class="cd${ds === hoje ? " hoje" : ""}${ds < hoje ? " passado" : ""}" aria-label="${extenso(ds)}">
        <div class="cd-top">${addBtn(ds)}<span class="cd-n">${d}</span></div>
        ${x.e.map(evChip).join("")}${x.a.map(anChip).join("")}${x.m.map(emChip).join("")}${x.p.map(cardPost).join("")}</div>`);
    }
    while (cels.length % 7) cels.push(`<div class="cd fora" aria-hidden="true"></div>`);

    // lista (celular)
    const dias = Object.keys(porDia).sort();
    const lista = dias.length ? dias.map(d => {
      const x = porDia[d];
      return `<section class="ld${d === hoje ? " hoje" : ""}"><div class="ld-h"><span class="ld-d">${cap(extenso(d))}</span>${d === hoje ? `<span class="ld-hoje">hoje</span>` : ""}<span class="cd-c">${nPosts(x.p.length)}</span>${addBtn(d)}</div>
        ${x.e.map(evChip).join("")}${x.a.map(anChip).join("")}${x.m.map(emChip).join("")}${x.p.map(cardPost).join("")}</section>`;
    }).join("") : `<div class="empty">Nenhum post ${Cal.conta === "Todas" ? "" : "desta conta "}neste mês.</div>`;

    const v = n => on ? n : "–";
    return `<div class="cal">
      <div class="topbar">
        <h1 class="tb-t">Calendário de publicações</h1>
        <div class="tb-c">
        <div class="seg" role="group" aria-label="Filtrar por conta">
          ${["Todas", "Oficial", "Glass"].map(c => `<button type="button" class="seg-b sb-${c}" data-cal-conta="${c}" aria-pressed="${Cal.conta === c}">${c === "Todas" ? "Todas" : CONTA_NOME[c]}</button>`).join("")}
        </div>
        <div class="mes-nav">
          <button type="button" class="mn-b" data-cal-mes="-1" aria-label="Mês anterior" ${Cal.mes <= MES_MIN ? "disabled" : ""}>‹</button>
          <select class="mn-sel" data-cal-sel aria-label="Escolher o mês">${meses.map(x => `<option value="${x}"${x === Cal.mes ? " selected" : ""}>${cap(mesNome(x))}</option>`).join("")}</select>
          <button type="button" class="mn-b" data-cal-mes="1" aria-label="Próximo mês" ${Cal.mes >= mesMax() ? "disabled" : ""}>›</button>
        </div>
        <button type="button" class="mn-hoje" data-cal-hoje>Hoje</button>
        ${Store.pode() ? `<button type="button" class="btn-pri" data-cal-add="${Cal.mes === hoje.slice(0, 7) ? hoje : Cal.mes + "-01"}">+ Novo evento</button>` : ""}
        </div>
      </div>
      <div class="stats cal-stats">
        <div class="stat"><b>${ps.length}</b><span>Posts no mês</span></div>
        <div class="stat st-ok"><b>${v(ap)}</b><span>Aprovados</span></div>
        <div class="stat st-aj"><b>${v(aj)}</b><span>Para ajustar</span></div>
        <div class="stat"><b>${v(ps.length - ap - aj)}</b><span>Aguardando</span></div>
      </div>
      ${aviso ? `<p class="cal-aviso" role="status">${aviso}</p>` : ""}
      <div class="cal-dias" aria-hidden="true">${DIAS_CURTOS.map(d => `<div class="cg-h">${d}</div>`).join("")}</div>
      <div class="cal-grid" aria-label="${cap(mesNome(Cal.mes))}">
        ${cels.join("")}
      </div>
      <div class="cal-lista">${lista}</div>
    </div>`;
  }

  /* ---------- janelas ---------- */
  const campo = (rot, v) => v ? `<div class="dl-i"><dt>${esc(rot)}</dt><dd>${esc(v)}</dd></div>` : "";
  const fechar = `<button type="button" class="dlg-x" data-dlg-close aria-label="Fechar">✕</button>`;

  function htmlPost(p) {
    const dec = Store.decisao(p.id), hist = Store.historico(p.id), pode = Store.pode();
    const ajustando = pode && !p.provisorio && Cal.ajustando === p.id;
    const rotRotulo = p.conta === "Glass" ? "Vinho que aparece" : "Rótulo ou vinho";
    let apr;
    if (p.provisorio) {
      apr = `<p class="muted">Aceita pelo site. Entra no cronograma na próxima atualização automática, e a aprovação fica liberada depois disso.</p>
        <p class="apr-login"><button type="button" class="link" data-ver-sol="${esc(p.sol)}">Ver o briefing completo</button></p>`;
    } else if (Store.mode === "off") {
      apr = `<p class="muted">Aprovações indisponíveis no momento.</p>`;
    } else {
      apr = `${ajustando ? "" : `<div class="apr-btns">
          <button type="button" class="btn-ok" data-apr="aprovado" ${pode ? "" : "disabled"}>✅ Aprovado</button>
          <button type="button" class="btn-aj" data-apr="ajustar" ${pode ? "" : "disabled"}>✏️ Ajustar</button>
        </div>`}
        ${pode ? "" : Store.user ? `<p class="muted">Este e-mail não tem permissão para aprovar.</p>` : `<p class="apr-login"><button type="button" class="link" data-cal-login>Entre para aprovar</button></p>`}
        <div class="hist"><h4>Histórico</h4>${hist.length ? `<ol>${hist.map(h => `<li>${selo(h.decisao)} <b>${esc(h.autor || "")}</b> <span class="muted">· ${quando(h.criado_em)}</span>${h.comentario ? `<p>${esc(h.comentario)}</p>` : ""}</li>`).join("")}</ol>` : `<p class="muted">Nenhuma decisão ainda.</p>`}</div>`;
    }
    const formatos = [...new Set(Object.values(FORMATO).concat(p.formato ? [p.formato] : []))];
    const corpo = ajustando
      ? `<form class="aj-form" data-ajuste-form>
          <label class="fl">Tema *<input name="tema" value="${esc(p.tema)}" required maxlength="300"></label>
          <div class="row2"><label class="fl">Data<input type="date" name="data" value="${esc(p.data)}" required></label>
            <label class="fl">Formato<select name="formato">${formatos.map(f => `<option${f === p.formato ? " selected" : ""}>${esc(f)}</option>`).join("")}</select></label></div>
          <label class="fl">Ideia do post<textarea name="ideia" rows="4" maxlength="3000">${esc(p.ideia || "")}</textarea></label>
          <label class="fl">Gancho (1ª frase)<textarea name="gancho" rows="2" maxlength="3000">${esc(p.gancho || "")}</textarea></label>
          <label class="fl">${rotRotulo}<input name="rotulo" value="${esc(p.rotulo || "")}" maxlength="3000"></label>
          <label class="fl">CTA<input name="cta" value="${esc(p.cta || "")}" maxlength="3000"></label>
          <label class="fl">O que precisa ajustar? <small>Opcional. Vai para o histórico.</small><textarea name="comentario" rows="2"></textarea></label>
          <div class="row"><button type="submit" class="btn-aj">Salvar ajuste</button><button type="button" class="btn-sec" data-aj-cancel>Cancelar</button></div>
          <p class="form-msg" role="status"></p>
        </form>`
      : `<h3 class="dlg-t" id="dlg-titulo">${esc(p.tema)}</h3>
      <div class="dlg-tags"><span class="pc-fmt">${esc(p.formato)}</span>${stPill(p.status)}</div>
      <dl class="dlg-dl">${campo("Ideia do post", p.ideia)}${campo("Gancho (1ª frase)", p.gancho)}${campo(rotRotulo, p.rotulo)}${campo("CTA", p.cta)}</dl>`;
    return `<div class="dlg-h"><div class="dlg-meta">${ctag(p.conta, CONTA_NOME[p.conta])}<span class="dlg-data">${cap(extenso(p.data))}</span></div>${fechar}</div>
      ${corpo}
      ${htmlAnexos("post", (p.base || p).id)}
      <section class="apr" aria-label="Aprovação"><h4>Aprovação ${p.provisorio ? "" : selo(dec)}</h4>${apr}</section>
      ${Store.user && Store.user.gestor ? `<div class="row post-del"><button type="button" class="btn-del" data-post-excluir>Excluir post</button></div>` : ""}`;
  }

  function htmlEvento(e) {
    const pode = Store.pode();
    return `<div class="dlg-h"><div class="dlg-meta"><span class="ev-ic" aria-hidden="true">${TIPOS[e.tipo] || "📌"}</span><span class="dlg-data">${cap(extenso(String(e.data).slice(0, 10)))}</span></div>${fechar}</div>
      <h3 class="dlg-t" id="dlg-titulo">${esc(e.titulo)}</h3>
      <div class="dlg-tags"><span class="pc-fmt">${esc(e.tipo)}</span>${ctag(e.conta, CONTAS_EV[e.conta])}</div>
      ${e.descricao ? `<p class="ev-desc">${esc(e.descricao)}</p>` : ""}
      <p class="muted small">Criado por ${esc(e.criado_por || "")}${e.criado_em ? " em " + quando(e.criado_em) : ""}</p>
      ${htmlAnexos("evento", e.id)}
      ${pode ? `<div class="row"><button type="button" class="btn-pri" data-ev-edit="${esc(e.id)}">Editar</button><button type="button" class="btn-del" data-ev-del="${esc(e.id)}">Apagar</button></div>`
        : !Store.user ? `<p class="apr-login"><button type="button" class="link" data-cal-login>Entre para editar</button></p>` : ""}`;
  }

  const htmlAniv = (x, ds) => `<div class="dlg-h"><div class="dlg-meta"><span class="ev-ic" aria-hidden="true">🎂</span><span class="dlg-data">${cap(extenso(ds))}</span></div>${fechar}</div>
      <h3 class="dlg-t" id="dlg-titulo">Aniversário ${esc(x.nome)}</h3>
      <div class="dlg-tags"><span class="antag">Aniversário</span></div>
      ${x.obs ? `<dl class="dlg-dl">${campo("Observação", x.obs)}</dl>` : ""}
      <p class="muted small">Vem da planilha Aniversários, atualizada pela equipe.</p>`;

  const dataBR = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const htmlEmpresa = (x, ds) => {
    const anos = +ds.slice(0, 4) - +x.entrada.slice(0, 4);
    return `<div class="dlg-h"><div class="dlg-meta"><span class="ev-ic" aria-hidden="true">🏢</span><span class="dlg-data">${cap(extenso(ds))}</span></div>${fechar}</div>
      <h3 class="dlg-t" id="dlg-titulo">Aniversário de empresa ${esc(x.nome)}</h3>
      <div class="dlg-tags"><span class="emtag">Aniversário de empresa</span><span class="pc-fmt">${anosTanyno(anos)}</span></div>
      <dl class="dlg-dl">${campo("Setor", x.setor)}${campo("Entrada na Tanyno", dataBR(x.entrada))}</dl>
      <p class="muted small">Vem da planilha Aniversários (aba Aniversário de empresa), atualizada pela equipe.</p>`;
  };

  function htmlForm(e) {
    const opt = (lista, sel) => Object.keys(lista).map(k => `<option value="${esc(k)}"${k === sel ? " selected" : ""}>${typeof lista[k] === "string" && lista === CONTAS_EV ? esc(lista[k]) : esc(k)}</option>`).join("");
    return `<form class="ev-form" data-ev-form data-id="${esc(e.id || "")}">
      <div class="dlg-h"><h3 class="dlg-t" id="dlg-titulo">${e.id ? "Editar evento" : "Novo evento"}</h3>${fechar}</div>
      <label class="fl">Título<input name="titulo" required maxlength="120" value="${esc(e.titulo || "")}"></label>
      <label class="fl">Data<input type="date" name="data" required min="${MES_MIN}-01" value="${esc(String(e.data || "").slice(0, 10))}"></label>
      <div class="row2">
        <label class="fl">Tipo<select name="tipo">${opt(TIPOS, e.tipo || "Data comemorativa")}</select></label>
        <label class="fl">Conta<select name="conta">${opt(CONTAS_EV, e.conta || "Ambas")}</select></label>
      </div>
      <label class="fl">Descrição<textarea name="descricao" rows="3">${esc(e.descricao || "")}</textarea></label>
      <div class="row"><button type="submit" class="btn-pri">Salvar</button><button type="button" class="btn-sec" data-dlg-close>Cancelar</button></div>
      <p class="form-msg" role="status"></p>
    </form>`;
  }

  function htmlLogin() {
    return `<form class="login-form" data-login-form>
      <div class="dlg-h"><h3 class="dlg-t" id="dlg-titulo">Entrar</h3>${fechar}</div>
      <label class="fl">E-mail<input type="email" name="email" required autocomplete="username"></label>
      <label class="fl">Senha<input type="password" name="senha" required autocomplete="current-password"></label>
      <div class="row"><button type="submit" class="btn-pri">Entrar</button></div>
      <p class="form-msg" role="status"></p>
    </form>`;
  }

  const opts = (lista, sel) => lista.map(x => `<option${x === sel ? " selected" : ""}>${esc(x)}</option>`).join("");
  function htmlDemanda() {
    const area = (n, rot, dica, req) => `<label class="fl">${rot}${dica ? ` <small>${dica}</small>` : ""}<textarea name="${n}" rows="3"${req ? ' required minlength="10"' : ""} maxlength="${n === "briefing" || n === "texto_aprovado" ? 8000 : 3000}"></textarea></label>`;
    return `<form class="ev-form" data-dem-form>
      <div class="dlg-h"><h3 class="dlg-t" id="dlg-titulo">Nova demanda</h3>${fechar}</div>
      <p class="muted small">Campos com * são obrigatórios. Quanto mais detalhe, menos ida e volta.</p>
      <label class="fl">Título *<input name="titulo" required minlength="3" maxlength="140" placeholder="Ex.: Stories do lançamento Bruno Clair"></label>
      <div class="row2">
        <label class="fl">Tipo de peça *<select name="tipo" required><option value="">Escolha</option>${opts(SOL_TIPOS)}</select></label>
        <label class="fl">Marca *<select name="marca" required><option value="">Escolha</option>${opts(SOL_MARCAS)}</select></label>
      </div>
      <div class="row2">
        <label class="fl"><span data-prazo-rot>Prazo desejado *</span><input type="date" name="prazo" required min="${hojeSP()}"></label>
        <label class="fl">Urgência<select name="urgencia">${opts(SOL_URG, "Média")}</select></label>
      </div>
      <div class="row2" data-pub hidden><label class="fl">Data de publicação *<input type="date" name="data_publicacao" min="${hojeSP()}"></label></div>
      ${area("objetivo", "Objetivo e público", "Para que serve e para quem")}
      ${area("briefing", "Briefing *", "O que precisa ser feito, com todos os detalhes", true)}
      ${area("texto_aprovado", "Texto aprovado", "Entra palavra por palavra")}
      <label class="fl">Formatos e tamanhos<input name="formatos" maxlength="1000" placeholder="Ex.: feed 1080x1350 e stories 1080x1920"></label>
      ${area("produtos", "Vinhos e produtos", "Rótulos, safras, códigos")}
      ${area("links", "Links de referência e arquivos", "Drive, site, referências; um por linha")}
      ${area("observacoes", "Observações")}
      <div class="row"><button type="submit" class="btn-pri">Enviar demanda</button><button type="button" class="btn-sec" data-dlg-close>Cancelar</button></div>
      <p class="form-msg" role="status"></p>
    </form>`;
  }
  // post de rede social (qualquer marca): pede o prazo de entrega e a data de publicação
  const ehSocialForm = f => !!FORMATO[f.elements.tipo.value];
  function ajustaFormDemanda(f) {
    const soc = ehSocialForm(f);
    f.querySelector("[data-prazo-rot]").textContent = soc ? "Prazo de entrega *" : "Prazo desejado *";
    f.querySelector("[data-pub]").hidden = !soc; f.elements.data_publicacao.required = soc;
  }
  const htmlDemandaOk = e => `<div class="dlg-h"><h3 class="dlg-t" id="dlg-titulo">Demanda enviada</h3>${fechar}</div>
      <p class="ev-desc">${esc(e.titulo)}</p>
      <p class="muted">O Rodrigo recebe o aviso por e-mail e a demanda entra na agenda na próxima atualização automática (a cada 2 horas, de segunda a sexta). Ela já aparece em Demandas, em "Enviadas pelo site".</p>
      <div class="row"><button type="button" class="btn-pri" data-dlg-close>Fechar</button></div>`;
  // só http(s) vira link; o resto é texto escapado
  const comLinks = t => String(t || "").split(/(https?:\/\/[^\s<>"']+)/).map((x, i) => i % 2
    ? `<a href="${esc(x)}" target="_blank" rel="noopener noreferrer">${esc(x)}</a>` : esc(x)).join("");
  // publicação = tipo que vai para o cronograma e marca que tem cronograma
  const CRONO = { "Tanyno": "Tanyno Oficial", "Tanyno Glass": "Tanyno Glass" };
  const FORMATO = { "Card feed": "Foto única", "Reels": "Reels", "Carrossel": "Carrossel", "Stories": "Stories" };
  const ehPost = s => !!(CRONO[s.marca] && FORMATO[s.tipo]);
  const ehPubEvento = s => !!FORMATO[s.tipo] && !CRONO[s.marca];           // ex.: Reels da Mililitros
  const contaEvento = s => s.marca === "Mililitros" ? "Mililitros" : "Interno";
  function htmlAceitar(s) {
    const hoje = hojeSP(), prazo = String(s.prazo || "").slice(0, 10), pedido = String(s.data_publicacao || "").slice(0, 10) || prazo,
      sug = pedido && pedido >= hoje ? pedido : hoje;
    return `<form class="ev-form" data-aceitar-form data-id="${esc(s.id)}">
      <div class="dlg-h"><h3 class="dlg-t" id="dlg-titulo">Aceitar demanda</h3>${fechar}</div>
      <p class="ev-desc"><b>${esc(s.titulo)}</b><br><span class="muted">${esc(s.tipo)} · ${esc(s.marca)} · pedido por ${esc(s.criado_por || "")}</span></p>
      ${ehPost(s) ? `<label class="fl">Data de publicação<input type="date" name="data_pub" required min="${hoje}" value="${sug}"></label>
        <p class="muted small">Entra nas suas demandas e no cronograma ${esc(CRONO[s.marca])} como ${esc(FORMATO[s.tipo])}, na próxima atualização automática.</p>`
        : ehPubEvento(s) ? `<label class="fl">Data de publicação<input type="date" name="data_pub" required value="${sug}"></label>
        <p class="muted small">Entra nas suas demandas e vira um evento ${esc(CONTAS_EV[contaEvento(s)])} no calendário nesse dia, ligado à demanda.</p>`
        : `<p class="muted small">Entra nas suas demandas na próxima atualização automática.</p>`}
      <div class="row"><button type="submit" class="btn-pri">Aceitar</button><button type="button" class="btn-sec" data-dlg-close>Cancelar</button></div>
      <p class="form-msg" role="status"></p>
    </form>`;
  }

  // ---------- demandas da planilha: ver, ações do check e editar ----------
  const PRIORIDADES = ["Alta", "Média", "Baixa"], STATUS = ["A fazer", "Em andamento", "Aprovação", "Aguardando", "Entregue"];
  const dmyBR = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
  function htmlDemVer(r) {
    const s = r.sol, prazo = String(r[3] || "").slice(0, 10), gestor = !!(Store.user && Store.user.gestor);
    return `<div class="dlg-h"><div class="dlg-meta">${r[0] ? `<span class="stp st-Publicado">Concluída</span>` : r[4] ? `<span class="pc-fmt">${esc(r[4])}</span>` : ""}${prazo ? `<span class="dlg-data">Prazo: ${cap(extenso(prazo))}</span>` : ""}</div>${fechar}</div>
      <h3 class="dlg-t" id="dlg-titulo">${esc(r[1])}</h3>
      <dl class="dlg-dl">${campo("Prioridade", r[2])}${campo("Status", r[0] ? "Feito" : r[4])}${campo("Pedido por", r[5])}${campo("No calendário", textoVinculo(vinculoDe(r)))}${r[6] ? `<div class="dl-i"><dt>Observações</dt><dd class="pre">${esc(r[6])}</dd></div>` : ""}</dl>
      ${s ? `<section class="apr" aria-label="Briefing"><h4>Briefing enviado pelo site</h4><dl class="dlg-dl">
        ${campo("Tipo de peça", s.tipo)}${campo("Marca", s.marca)}${campo("Urgência", s.urgencia)}${s.data_publicacao ? campo("Data de publicação", dmyBR(String(s.data_publicacao).slice(0, 10))) : ""}
        ${SOL_CAMPOS.map(([k, rot]) => s[k] ? `<div class="dl-i"><dt>${rot}</dt><dd class="pre">${k === "links" ? comLinks(s[k]) : esc(s[k])}</dd></div>` : "").join("")}
        </dl><p class="muted small">Pedido por ${esc(s.criado_por || "")}${s.criado_em ? " em " + quando(s.criado_em) : ""}</p></section>` : ""}
      <div class="row">${gestor && r.linha !== undefined ? `<button type="button" class="btn-pri" data-dem-editar>Editar</button>` : ""}<button type="button" class="btn-sec" data-dlg-close>Fechar</button></div>`;
  }
  function htmlDemAcoes(r) {
    return `<div class="dlg-h"><h3 class="dlg-t" id="dlg-titulo">${esc(r[1])}</h3>${fechar}</div>
      <p class="muted small">A mudança aparece na hora aqui e vai para a planilha na próxima atualização automática.</p>
      <div class="acoes">
        <button type="button" class="btn-ac" data-dem-feito>${r[0] ? "Reabrir" : "Concluir"}</button>
        <button type="button" class="btn-sec" data-dem-editar>Editar</button>
        <button type="button" class="btn-del" data-dem-excluir>Excluir</button>
      </div>`;
  }
  function htmlDemEditar(r) {
    const op = (lista, sel) => `${sel && !lista.includes(sel) ? `<option selected>${esc(sel)}</option>` : ""}${!sel ? `<option value="" selected>Sem prioridade</option>` : ""}` + lista.map(x => `<option${x === sel ? " selected" : ""}>${esc(x)}</option>`).join("");
    return `<form class="ev-form" data-dem-editar-form>
      <div class="dlg-h"><h3 class="dlg-t" id="dlg-titulo">Editar demanda</h3>${fechar}</div>
      <label class="fl">Demanda<input name="demanda" required maxlength="300" value="${esc(r[1])}"></label>
      <div class="row2">
        <label class="fl">Prioridade<select name="prioridade">${op(PRIORIDADES, r[2])}</select></label>
        <label class="fl">Prazo<input type="date" name="prazo" value="${esc(String(r[3] || "").slice(0, 10))}"></label>
      </div>
      <label class="fl">Status<select name="status">${op(STATUS, r[4] || "A fazer")}</select></label>
      ${(pub => pub ? `<label class="fl">Data de publicação <small>O post ou evento ligado vai para esse dia</small><input type="date" name="data_pub" value="${esc(pub)}"></label>` : "")(dataPubDe(vinculoDe(r)))}
      <label class="fl">No calendário <small>Evento ligado anda junto com o prazo; post segue a data de publicação</small><select name="vinculo">
        <option value="">Nenhum</option>${(r._op = opcoesCalendario()).map((o, i) => { const v = vinculoDe(r);
          const sel = v && (v.tipo === "evento" ? o.evento_id === v.evento_id : o.tipo === "post" && o.conta === v.conta && o.data === String(v.data).slice(0, 10) && o.tema === v.tema);
          return `<option value="${i}"${sel ? " selected" : ""}>${esc(o.rot)}</option>`; }).join("")}</select></label>
      <label class="fl">Observações<textarea name="observacoes" rows="3" maxlength="3000">${esc(r[6] || "")}</textarea></label>
      <div class="row"><button type="submit" class="btn-pri">Salvar</button><button type="button" class="btn-sec" data-dlg-close>Cancelar</button></div>
      <p class="form-msg" role="status"></p>
    </form>`;
  }
  const edicao = (r, campo, valor) => ({ linha: r.linha, demanda: r.orig, campo, valor: String(valor) });
  // demanda do site fica ligada pela solicitação; as da planilha pela linha e nome
  const chaveVinc = r => r.sol ? { linha: 0, demanda: "sol:" + r.sol.id } : { linha: r.linha, demanda: r.orig };
  const vinculoDe = r => r && Store.vinculos.find(v => (r.sol && v.demanda === "sol:" + r.sol.id) || (r.solKey && v.demanda === r.solKey)
    || (v.linha > 0 && v.demanda === r.orig));
  const vinculosDe = r => r ? Store.vinculos.filter(v => (r.sol && v.demanda === "sol:" + r.sol.id) || (r.solKey && v.demanda === r.solKey)
    || (v.linha > 0 && v.demanda === r.orig)) : [];
  const eventoDe = v => v && v.tipo === "evento" && Store.eventos.find(e => String(e.id) === String(v.evento_id));
  // data de publicação do que está ligado (post, ou evento de publicação); null se o vínculo segue o prazo
  const dataPubDe = v => !v ? null : v.tipo === "post" ? ((postDoVinculo(v) || {}).data || null)
    : v.publicacao ? String((eventoDe(v) || {}).data || "").slice(0, 10) || null : null;
  const postDoVinculo = v => todosPosts().find(x => casaVinc(v, x));
  // prazo mudou: o evento ligado (que não é de publicação) vai para o mesmo dia. Post e evento de publicação seguem a data de publicação.
  async function moveVinculado(r, nova) {
    const v = vinculoDe(r), ev = eventoDe(v);
    if (ev && !v.publicacao && nova && String(ev.data).slice(0, 10) !== nova) await Store.saveEvento(Object.assign({}, ev, { data: nova }));
    return [];
  }
  // data de publicação mudou: o post (cronograma) ou o evento de publicação vai para esse dia
  async function movePublicacao(v, nova) {
    if (!v || !nova) return [];
    if (v.tipo === "evento") {
      const ev = eventoDe(v);
      if (ev && String(ev.data).slice(0, 10) !== nova) await Store.saveEvento(Object.assign({}, ev, { data: nova }));
      return [];
    }
    const p = postDoVinculo(v);
    if (!p || p.data === nova) return [];
    await Store.updVinculo(v.id, { data: nova });
    return [{ linha: 0, demanda: chavePost(Object.assign({}, p, p.base)), campo: "mover_post", valor: nova }];
  }
  // nome da demanda mudou: os eventos ligados mudam de nome junto
  async function renomeiaEventos(r, nome) {
    for (const v of vinculosDe(r)) { const ev = eventoDe(v); if (ev && ev.titulo !== nome) await Store.saveEvento(Object.assign({}, ev, { titulo: nome.slice(0, 120) })); }
  }
  const dm = d => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`;
  // demandas ligadas a um post ou evento que foi excluído: excluídas junto (aparece na hora; a rotina apaga na planilha)
  const excluiLigadas = vs => vs.map(v => ({ linha: v.linha || 0, demanda: v.demanda, campo: "excluir", valor: "sim" }));
  function opcoesCalendario() {
    const desde = addMes(hojeSP().slice(0, 7), -1) + "-01";
    const posts = todosPosts().filter(p => p.data >= desde).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0)
      .map(p => ({ tipo: "post", conta: p.conta, data: p.data, tema: p.tema, rot: `${CONTA_NOME[p.conta]} · ${dm(p.data)} · ${p.formato} · ${p.tema}` }));
    const evs = Store.eventos.filter(e => String(e.data).slice(0, 10) >= desde)
      .map(e => ({ tipo: "evento", evento_id: e.id, data: String(e.data).slice(0, 10), rot: `Evento · ${dm(e.data)} · ${e.titulo}` }));
    return posts.concat(evs);
  }
  function textoVinculo(v) {
    if (!v) return "";
    if (v.tipo === "evento") { const ev = Store.eventos.find(e => String(e.id) === String(v.evento_id)); return ev ? `Evento: ${ev.titulo} · ${cap(extenso(String(ev.data).slice(0, 10)))}` : ""; }
    const p = postDoVinculo(v);
    return p ? `${CONTA_NOME[p.conta]} · ${cap(extenso(p.data))} · ${p.formato} · ${p.tema}` : "";
  }

  function htmlSol(s) {
    const prazo = String(s.prazo || "").slice(0, 10);
    return `<div class="dlg-h"><div class="dlg-meta"><span class="pc-fmt">${esc(s.tipo)}</span><span class="dlg-data">${esc(s.marca)}</span></div>${fechar}</div>
      <h3 class="dlg-t" id="dlg-titulo">${esc(s.titulo)}</h3>
      <p class="muted small">Pedido por ${esc(s.criado_por || "")}${s.criado_em ? " em " + quando(s.criado_em) : ""}</p>
      <dl class="dlg-dl">
        ${prazo ? `<div class="dl-i"><dt>${s.data_publicacao ? "Prazo de entrega" : "Prazo desejado"}</dt><dd>${cap(extenso(prazo))}</dd></div>` : ""}
        ${s.data_publicacao ? `<div class="dl-i"><dt>Data de publicação</dt><dd>${cap(extenso(String(s.data_publicacao).slice(0, 10)))}</dd></div>` : ""}
        ${campo("Urgência", s.urgencia)}
        ${SOL_CAMPOS.map(([k, rot]) => s[k] ? `<div class="dl-i"><dt>${rot}</dt><dd class="pre">${k === "links" ? comLinks(s[k]) : esc(s[k])}</dd></div>` : "").join("")}
      </dl>
      <div class="row"><button type="button" class="btn-sec" data-dlg-close>Fechar</button></div>`;
  }

  function abre(tipo, id, extra) {
    if (!Cal.dlg) {
      Cal.dlg = document.createElement("dialog");
      Cal.dlg.className = "cal-dlg";
      Cal.dlg.setAttribute("aria-labelledby", "dlg-titulo");
      document.body.appendChild(Cal.dlg);
      Cal.dlg.addEventListener("click", onDlgClick);
      Cal.dlg.addEventListener("submit", onDlgSubmit);
      Cal.dlg.addEventListener("change", ev => {
        const f = ev.target.form;
        if (f && f.hasAttribute("data-dem-form") && (ev.target.name === "tipo" || ev.target.name === "marca")) ajustaFormDemanda(f);
        if (ev.target.matches && ev.target.matches("[data-anx-input]")) subirArquivos(ev.target);
      });
      Cal.dlg.addEventListener("close", () => { Cal.aberto = null; if (Cal.ultimoFoco && document.contains(Cal.ultimoFoco)) Cal.ultimoFoco.focus(); });
    }
    if (!Cal.dlg.open) Cal.ultimoFoco = document.activeElement;
    if (!Cal.aberto || Cal.aberto.id !== id) { Cal.pvI = 0; Cal.ajustando = null; }
    Cal.aberto = { tipo, id, extra };
    desenhaDlg();
    if (!Cal.dlg.open) Cal.dlg.showModal();
    const alvo = Cal.dlg.querySelector("input,textarea") || Cal.dlg.querySelector(".dlg-x");
    if (alvo && tipo !== "post" && tipo !== "evento" && tipo !== "sol") alvo.focus();
  }

  function desenhaDlg() {
    const a = Cal.aberto; if (!a || !Cal.dlg) return;
    let h = "";
    if (a.tipo === "post") { const p = todosPosts().find(x => x.id === a.id); if (!p) return Cal.dlg.close(); h = htmlPost(p); }
    else if (a.tipo === "evento") { const e = Store.eventos.find(x => String(x.id) === String(a.id)); if (!e) return Cal.dlg.close(); h = htmlEvento(e); }
    else if (a.tipo === "form") h = htmlForm(a.extra || {});
    else if (a.tipo === "login") h = htmlLogin();
    else if (a.tipo === "empresa") { const x = Cal.empresa[+a.id]; if (!x) return Cal.dlg.close(); h = htmlEmpresa(x, a.extra); }
    else if (a.tipo === "aniv") { const x = Cal.anivs[+a.id]; if (!x) return Cal.dlg.close(); h = htmlAniv(x, a.extra); }
    else if (a.tipo === "demanda") h = htmlDemanda();
    else if (a.tipo === "dem-ver") h = htmlDemVer(a.extra);
    else if (a.tipo === "dem-acoes") h = htmlDemAcoes(a.extra);
    else if (a.tipo === "dem-editar") h = htmlDemEditar(a.extra);
    else if (a.tipo === "aceitar") { const s = Store.sols.find(x => String(x.id) === String(a.id)); if (!s) return Cal.dlg.close(); h = htmlAceitar(s); }
    else if (a.tipo === "demanda-ok") h = htmlDemandaOk(a.extra || {});
    else if (a.tipo === "sol") { const s = Store.sols.find(x => String(x.id) === String(a.id)); if (!s) return Cal.dlg.close(); h = htmlSol(s); }
    const alvoAnx = a.tipo === "post" ? ((todosPosts().find(x => x.id === a.id) || {}).base || {}).id : a.id;
    const midia = (a.tipo === "post" || a.tipo === "evento") && anexosDe(a.tipo, alvoAnx).length;
    Cal.dlg.classList.toggle("pv-on", !!midia);
    Cal.dlg.innerHTML = midia ? `<div class="dlg-in pv"><div class="pv-m" data-pv aria-label="Arquivos"><p class="muted small">Carregando…</p></div><div class="pv-i">${h}</div></div>`
      : `<div class="dlg-in">${h}</div>`;
    preencheAnexos();
  }

  function erroMsg(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/row-level security|permission|42501/i.test(m)) return "Sem permissão. Entre com um e-mail autorizado.";
    return "Não foi possível salvar: " + m;
  }

  async function onDlgClick(ev) {
    const t = ev.target;
    if (t === Cal.dlg) { Cal.dlg.close(); return; }
    const b = t.closest("button"); if (!b) return;
    if (b.hasAttribute("data-dlg-close")) { Cal.dlg.close(); return; }
    if (b.hasAttribute("data-cal-login")) { abre("login"); return; }
    if (b.dataset.nav) { abre("post", b.dataset.nav); return; }
    if (b.dataset.verSol) { abre("sol", b.dataset.verSol); return; }
    if (b.dataset.pvIr !== undefined) { Cal.pvI = +b.dataset.pvIr; desenhaMidia(); return; }
    if (b.hasAttribute("data-aj-cancel")) { Cal.ajustando = null; desenhaDlg(); return; }
    if (b.dataset.anxDel) {
      const a = Store.anexos.find(x => String(x.id) === b.dataset.anxDel);
      if (a && confirm(`Apagar o arquivo "${a.nome}"?`)) { try { await Store.apagarAnexo(a); notify(); } catch (e) { alert(erroMsg(e)); } }
      return;
    }
    if (b.hasAttribute("data-post-excluir")) {
      const p = todosPosts().find(x => x.id === Cal.aberto.id);
      if (!p) return;
      const ligados = p.provisorio ? [] : Store.vinculos.filter(v => casaVinc(v, p));
      const n = p.provisorio ? 1 : ligados.length;
      if (!confirm(`Excluir o post "${p.tema}" de ${dm(p.data)}?${n ? ` A demanda ligada a ele também é excluída.` : ""} Some agora e sai do cronograma na próxima atualização.`)) return;
      try {
        const eds = p.provisorio ? [{ linha: 0, demanda: "sol:" + p.sol, campo: "excluir", valor: "sim" }]
          : [{ linha: 0, demanda: chavePost(Object.assign({}, p, p.base)), campo: "excluir_post", valor: "sim" }].concat(excluiLigadas(ligados));
        for (const v of ligados) await Store.delVinculo(v.id);
        await Store.addEdicoes(eds); Cal.dlg.close(); notify();
      } catch (e) { alert(erroMsg(e)); }
      return;
    }
    const r = Cal.aberto && Cal.aberto.extra;
    if (b.hasAttribute("data-dem-editar")) { abre("dem-editar", null, r); return; }
    if (b.hasAttribute("data-dem-feito")) {
      b.disabled = true;
      try { await Store.addEdicoes([edicao(r, "feito", !r[0])]); Cal.dlg.close(); notify(); }
      catch (e) { alert(erroMsg(e)); b.disabled = false; }
      return;
    }
    if (b.hasAttribute("data-dem-excluir")) {
      const evs = vinculosDe(r).filter(v => eventoDe(v));
      if (!confirm(`Excluir a demanda "${r[1]}"?${evs.length ? " O evento ligado a ela também é apagado." : ""} Ela sai do site agora e da planilha na próxima atualização.`)) return;
      try {
        for (const v of evs) { const id = v.evento_id; await Store.delVinculo(v.id); await Store.delEvento(id); }
        await Store.addEdicoes([edicao(r, "excluir", "sim")]); Cal.dlg.close(); notify();
      }
      catch (e) { alert(erroMsg(e)); }
      return;
    }
    if (b.dataset.apr === "aprovado") {
      b.disabled = true;
      try { await Store.addAprov(Cal.aberto.id, "aprovado", ""); notify(); }
      catch (e) { alert(erroMsg(e)); b.disabled = false; }
      return;
    }
    if (b.dataset.apr === "ajustar") {
      Cal.ajustando = Cal.aberto.id; desenhaDlg();
      const t = Cal.dlg.querySelector("[data-ajuste-form] [name=tema]"); if (t) { t.focus(); t.scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (b.dataset.evEdit) { const e = Store.eventos.find(x => String(x.id) === b.dataset.evEdit); abre("form", null, Object.assign({}, e)); return; }
    if (b.dataset.evDel) {
      const e = Store.eventos.find(x => String(x.id) === b.dataset.evDel);
      const ligados = Store.vinculos.filter(v => v.tipo === "evento" && String(v.evento_id) === b.dataset.evDel);
      if (!confirm(`Apagar o evento "${e ? e.titulo : ""}"?${ligados.length ? " A demanda ligada a ele também é excluída." : ""} Isso não pode ser desfeito.`)) return;
      try {
        if (ligados.length) { for (const v of ligados) await Store.delVinculo(v.id); await Store.addEdicoes(excluiLigadas(ligados)); }
        await Store.delEvento(b.dataset.evDel); Cal.dlg.close(); notify();
      }
      catch (err) { alert(erroMsg(err)); }
    }
  }

  async function onDlgSubmit(ev) {
    ev.preventDefault();
    const f = ev.target, msg = f.querySelector(".form-msg");
    const btn = f.querySelector("button[type=submit]");
    if (f.hasAttribute("data-ajuste-form")) {
      const p = todosPosts().find(x => x.id === Cal.aberto.id);
      if (!p) return;
      const el = f.elements, novo = {}, mud = [];
      const ROT = { formato: "formato", tema: "tema", ideia: "ideia", gancho: "gancho", rotulo: "rótulo", cta: "CTA" };
      for (const c of AJ_CAMPOS) { const v = el[c].value.trim(); if (v !== (p[c] || "").trim()) { novo[c] = v; mud.push(ROT[c]); } }
      if (!el.tema.value.trim()) { msg.textContent = "O tema não pode ficar vazio."; el.tema.focus(); return; }
      const nova = el.data.value, mudouData = !!nova && nova !== p.data;
      if (mudouData) mud.push("data");
      const txt = el.comentario.value.trim();
      if (!mud.length && !txt) { msg.textContent = "Mude algum campo ou escreva o que precisa ajustar."; return; }
      btn.disabled = true; msg.textContent = "Salvando…";
      try {
        const chave = chavePost(Object.assign({}, p, p.base)), ligados = Store.vinculos.filter(v => casaVinc(v, p));
        const eds = Object.keys(novo).map(c => ({ linha: 0, demanda: chave, campo: "post_" + c, valor: novo[c] }));
        if (mudouData) {
          eds.push({ linha: 0, demanda: chave, campo: "mover_post", valor: nova });
        }
        for (const v of ligados) {
          const up = Object.assign({}, mudouData ? { data: nova } : {}, novo.tema ? { tema: novo.tema } : {});
          if (Object.keys(up).length) await Store.updVinculo(v.id, up);
        }
        await Store.addEdicoes(eds);
        const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
        await Store.addAprov(p.id, "ajustar", txt || (mud.length ? `${cap1(mud.join(", "))} ajustado${mud.length > 1 ? "s" : ""} no site.` : ""));
        Cal.ajustando = null; notify();
      } catch (e) { msg.textContent = erroMsg(e); btn.disabled = false; }
      return;
    }
    if (f.hasAttribute("data-ev-form")) {
      const d = { id: f.dataset.id || null, titulo: f.titulo.value.trim(), data: f.data.value, tipo: f.tipo.value, conta: f.conta.value, descricao: f.descricao.value.trim() };
      if (!d.titulo || !d.data) return;
      btn.disabled = true;
      try {
        const antes = d.id && Store.eventos.find(x => String(x.id) === String(d.id));
        const eds = !antes ? [] : Store.vinculos.filter(v => v.tipo === "evento" && String(v.evento_id) === String(d.id)).flatMap(v => [].concat(
          d.titulo !== antes.titulo ? [{ linha: v.linha || 0, demanda: v.demanda, campo: "demanda", valor: d.titulo }] : [],
          !v.publicacao && d.data !== String(antes.data).slice(0, 10) ? [{ linha: v.linha || 0, demanda: v.demanda, campo: "prazo", valor: d.data }] : []));
        await Store.saveEvento(d);
        if (eds.length) await Store.addEdicoes(eds);
        const salvo = d.id ? d.id : (Store.eventos.filter(x => x.titulo === d.titulo && String(x.data).slice(0, 10) === d.data).pop() || {}).id;
        if (d.data.slice(0, 7) !== Cal.mes) Cal.mes = clampMes(d.data.slice(0, 7));
        notify();
        if (salvo) abre("evento", salvo); else Cal.dlg.close();
      } catch (e) { msg.textContent = erroMsg(e); btn.disabled = false; }
      return;
    }
    if (f.hasAttribute("data-dem-editar-form")) {
      const r = Cal.aberto.extra, el = f.elements, novo = [];
      const muda = (campo, atual, valor) => { if (valor !== atual && !(campo === "prioridade" && !valor)) novo.push(edicao(r, campo, valor)); };
      if (!el.demanda.value.trim()) { el.demanda.focus(); return; }
      muda("demanda", r[1], el.demanda.value.trim());
      muda("prioridade", r[2] || "", el.prioridade.value);
      if (el.prazo.value) muda("prazo", String(r[3] || "").slice(0, 10), el.prazo.value);
      muda("status", r[4] || "A fazer", el.status.value);
      muda("observacoes", r[6] || "", el.observacoes.value.trim());
      btn.disabled = true; msg.textContent = "Salvando…";
      try {
        const atual = vinculoDe(r), esc_ = el.vinculo.value === "" ? null : r._op[+el.vinculo.value];
        const mesmo = atual && esc_ && (atual.tipo === "evento" ? esc_.evento_id === atual.evento_id
          : esc_.tipo === "post" && esc_.conta === atual.conta && esc_.data === String(atual.data).slice(0, 10) && esc_.tema === atual.tema);
        if (!mesmo && (atual || esc_)) {
          if (atual) await Store.delVinculo(atual.id);
          if (esc_) await Store.addVinculo(Object.assign(chaveVinc(r), esc_.tipo === "evento"
            ? { tipo: "evento", evento_id: esc_.evento_id } : { tipo: "post", conta: esc_.conta, data: esc_.data, tema: esc_.tema, publicacao: true }));
        }
        const pz = novo.find(e => e.campo === "prazo"), nm = novo.find(e => e.campo === "demanda");
        if (mesmo || (!atual && !esc_)) {
          if (pz) await moveVinculado(r, pz.valor);
          const pub = el.data_pub && el.data_pub.value;
          if (pub && pub !== dataPubDe(atual)) novo.push(...await movePublicacao(atual, pub));
        }
        if (nm) await renomeiaEventos(r, nm.valor);
        await Store.addEdicoes(novo); Cal.dlg.close(); notify();
      }
      catch (e) { msg.textContent = erroMsg(e); btn.disabled = false; }
      return;
    }
    if (f.hasAttribute("data-aceitar-form")) {
      const dp = f.elements.data_pub ? f.elements.data_pub.value : null;
      btn.disabled = true; msg.textContent = "Salvando…";
      try {
        await Store.decide(f.dataset.id, "aceita", dp);
        const s = Store.sols.find(x => String(x.id) === String(f.dataset.id));
        if (s && dp && ehPost(s)) await Store.addVinculo({ linha: 0, demanda: "sol:" + s.id, tipo: "post", conta: s.marca === "Tanyno" ? "Oficial" : "Glass", data: dp, tema: s.titulo, publicacao: true });
        else if (s && dp && ehPubEvento(s))
          await Store.saveEvento({ data: dp, titulo: s.titulo.slice(0, 120), tipo: "Post extra", conta: contaEvento(s),
            descricao: `Demanda pedida por ${s.criado_por || ""} pelo site (${s.tipo}).`, demanda: "sol:" + s.id });
        Cal.dlg.close(); notify();
      }
      catch (e) { msg.textContent = erroMsg(e); btn.disabled = false; }
      return;
    }
    if (f.hasAttribute("data-dem-form")) {
      const d = {};
      ["titulo", "tipo", "marca", "prazo", "urgencia", "objetivo", "briefing", "texto_aprovado", "formatos", "produtos", "links", "observacoes"]
        .forEach(k => { const v = f.elements[k].value.trim(); d[k] = v || null; });
      d.data_publicacao = ehSocialForm(f) ? f.elements.data_publicacao.value || null : null;
      if (!d.titulo || !d.tipo || !d.marca || !d.prazo || !d.briefing || (ehSocialForm(f) && !d.data_publicacao)) { msg.textContent = "Preencha os campos com *."; return; }
      if (d.data_publicacao && d.data_publicacao < d.prazo) { msg.textContent = "A data de publicação não pode ser antes do prazo de entrega."; return; }
      btn.disabled = true; msg.textContent = "Enviando…";
      try { await Store.addSolicitacao(d); abre("demanda-ok", null, { titulo: d.titulo }); notify(); }
      catch (e) { msg.textContent = erroMsg(e).replace("salvar", "enviar"); btn.disabled = false; }
      return;
    }
    if (f.hasAttribute("data-login-form")) {
      btn.disabled = true; msg.textContent = "Entrando…";
      try { await Store.signIn(f.email.value.trim(), f.senha.value); Cal.dlg.close(); }
      catch (e) { msg.textContent = e.message || String(e); btn.disabled = false; }
    }
  }

  /* ---------- eventos da página ---------- */
  function onClick(ev) {
    const b = ev.target.closest("button"); if (!b || !Cal.ativo || !Cal.root || !Cal.root.contains(b)) return;
    if (b.dataset.calConta) { Cal.conta = b.dataset.calConta; render(); return; }
    if (b.dataset.calMes) { Cal.mes = clampMes(addMes(Cal.mes, Number(b.dataset.calMes))); render(); return; }
    if (b.hasAttribute("data-cal-hoje")) { Cal.mes = clampMes(hojeSP().slice(0, 7)); render(); return; }
    if (b.dataset.calPost) { abre("post", b.dataset.calPost); return; }
    if (b.dataset.calEv) { abre("evento", b.dataset.calEv); return; }
    if (b.dataset.calAniv) { abre("aniv", b.dataset.calAniv, b.dataset.dia); return; }
    if (b.dataset.calEmpresa) { abre("empresa", b.dataset.calEmpresa, b.dataset.dia); return; }
    if (b.dataset.calAdd) {
      if (!Store.user) { abre("login"); return; }
      if (!Store.pode()) { alert("Este e-mail não tem permissão para criar eventos."); return; }
      abre("form", null, { data: b.dataset.calAdd, conta: Cal.conta === "Todas" ? "Ambas" : Cal.conta });
    }
  }
  function onChange(ev) {
    if (ev.target.matches && ev.target.matches("[data-cal-sel]")) { Cal.mes = clampMes(ev.target.value); render(); }
  }

  function render() {
    if (!Cal.root || !Cal.root.isConnected || !Cal.ativo) return;
    const foco = document.activeElement && document.activeElement.dataset ? Object.assign({}, document.activeElement.dataset) : null;
    Cal.root.innerHTML = htmlCalendario();
    preencheMinis();
    if (foco) { // devolve o foco ao mesmo controle depois de redesenhar
      const k = Object.keys(foco).find(x => x.startsWith("cal"));
      if (k) { const attr = "data-" + k.replace(/[A-Z]/g, c => "-" + c.toLowerCase()); const el = Cal.root.querySelector(`[${attr}="${CSS.escape(foco[k])}"]`); if (el) el.focus(); }
    }
  }

  function renderAuth() {
    const el = document.getElementById("auth"); if (!el) return;
    if (Store.mode === "off") { el.innerHTML = ""; return; }
    if (Store.user) {
      const nome = Store.user.nome || Store.user.email || "";
      const ini = nome.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("");
      el.innerHTML = `<span class="av" aria-hidden="true">${esc(ini)}</span><span class="auth-who" title="${esc(Store.user.email)}">${esc(nome)}</span><button type="button" class="auth-b" data-auth-out>Sair</button>`;
    } else {
      el.innerHTML = `<button type="button" class="auth-b" data-auth-in>Entrar</button>`;
    }
  }

  function notify() {
    renderAuth();
    if (api.onUpdate) api.onUpdate();
    render();
    if (Cal.dlg && Cal.dlg.open && Cal.aberto && (Cal.aberto.tipo === "post" || Cal.aberto.tipo === "evento")) desenhaDlg();
  }

  let ultimoRefresh = 0;
  async function atualizaAoVoltar() {
    if (Store.mode !== "supabase" || Date.now() - ultimoRefresh < 30000) return;
    ultimoRefresh = Date.now();
    try { await Store.refresh(); notify(); } catch (e) { /* mantém o que já tem */ }
  }

  const api = {
    onUpdate: null,
    init(posts, anivs, empresa) {
      Cal.posts = Array.isArray(posts) ? posts.filter(p => p && p.data && p.id) : [];
      Cal.anivs = Array.isArray(anivs) ? anivs.filter(a => a && a.nome && /^\d\d-\d\d$/.test(a.dia)) : [];
      Cal.empresa = Array.isArray(empresa) ? empresa.filter(a => a && a.nome && /^\d{4}-\d\d-\d\d$/.test(a.entrada)) : [];
      Cal.mes = clampMes(hojeSP().slice(0, 7));
    },
    start() {
      const authEl = document.getElementById("auth");
      if (authEl) authEl.addEventListener("click", async ev => {
        const b = ev.target.closest("button"); if (!b) return;
        if (b.hasAttribute("data-auth-in")) abre("login");
        if (b.hasAttribute("data-auth-out")) { await Store.signOut(); notify(); }
      });
      window.addEventListener("focus", atualizaAoVoltar);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizaAoVoltar(); });
      return Store.init().then(() => { ultimoRefresh = Date.now(); notify(); });
    },
    mount(el) {
      Cal.root = el; Cal.ativo = true;
      if (!el._calBound) { el.addEventListener("click", onClick); el.addEventListener("change", onChange); el._calBound = true; }
      render();
    },
    unmount() { Cal.ativo = false; },
    pendentes,
    get store() { return Store; },
    solicitacoes: () => Store.sols,
    novaDemanda() {
      if (Store.mode === "off") return;
      if (!Store.user) { abre("login"); return; }
      if (!Store.pode()) { alert("Este e-mail não tem permissão para incluir demandas."); return; }
      abre("demanda");
    },
    verSolicitacao(id) { abre("sol", id); },
    podeAceitar: () => !!(Store.user && Store.user.gestor),
    aceitarDemanda(id) { abre("aceitar", id); },
    edicoes: () => Store.edicoes,
    verDemanda(r) { abre("dem-ver", null, r); },
    acoesDemanda(r) { abre("dem-acoes", null, r); },
    async editaCampo(r, campo, valor) {
      try {
        if (campo === "prazo") await moveVinculado(r, valor);
        await Store.addEdicoes([edicao(r, campo, valor)]); notify();
      } catch (e) { alert(erroMsg(e)); notify(); }
    },
    async recusarDemanda(id) {
      const s = Store.sols.find(x => String(x.id) === String(id));
      if (!s || !confirm(`Recusar "${s.titulo}"? Ela some da lista.`)) return;
      try { await Store.decide(id, "recusada"); notify(); } catch (e) { alert(erroMsg(e)); }
    },
    carregaAgenda: () => Store.carregaAgenda(),
    async entrar(email, senha) { await Store.signIn(email, senha); },
    async sair() { await Store.signOut(); notify(); }
  };
  window.Calendario = api;
})();
