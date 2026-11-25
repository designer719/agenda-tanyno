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
  const CONTAS_EV = { Ambas: "Ambas as contas", Oficial: "Tanyno Oficial", Glass: "Tanyno Glass", Interno: "Interno" };
  const CONTA_NOME = { Oficial: "Tanyno Oficial", Glass: "Tanyno Glass" };

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
    mode: "off", erro: "", user: null, aprov: [], eventos: [], client: null,

    async init() {
      const q = new URLSearchParams(location.search);
      if (q.get("demo") === "1" || q.get("demo") === "anon") {
        this.mode = "demo";
        this.user = q.get("demo") === "anon" ? null : { email: "", nome: "Demonstração", permitido: true };
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
        this.client.auth.onAuthStateChange((_ev, s) => { setTimeout(() => this.setSession(s).then(notify), 0); });
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
      } catch (e) { /* sem permissão ou fora do ar */ }
      this.user = u;
    },

    async refresh() {
      if (this.mode === "demo") return;
      const [a, e] = await Promise.all([
        this.client.from("aprovacoes").select("*").order("criado_em", { ascending: false }),
        this.client.from("eventos").select("*").order("data", { ascending: true })
      ]);
      if (a.error) throw a.error;
      if (e.error) throw e.error;
      this.aprov = a.data || [];
      this.eventos = e.data || [];
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
      if (this.mode === "demo") {
        if (ev.id) Object.assign(this.eventos.find(x => x.id === ev.id), campos);
        else this.eventos.push(Object.assign({ id: "e" + Date.now(), criado_por: this.user.nome, criado_em: new Date().toISOString() }, campos));
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

    async signIn(email) {
      if (this.mode === "demo") { this.user = { email, nome: "Demonstração", permitido: true }; setTimeout(notify, 0); return; }
      const { error } = await this.client.auth.signInWithOtp({
        email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true }
      });
      if (error) throw error;
    },

    async signOut() {
      if (this.mode === "demo") { this.user = null; return; }
      await this.client.auth.signOut();
      this.user = null;
    }
  };

  /* ---------- estado do calendário ---------- */
  const Cal = { posts: [], mes: null, conta: "Todas", root: null, dlg: null, aberto: null, ultimoFoco: null };

  const mesMax = () => {
    let max = "2027-12";
    Cal.posts.forEach(p => { const m = p.data.slice(0, 7); if (m > max) max = m; });
    return max;
  };
  const clampMes = ym => ym < MES_MIN ? MES_MIN : ym > mesMax() ? mesMax() : ym;
  const filtraConta = c => Cal.conta === "Todas" || c === Cal.conta;
  const postsMes = () => Cal.posts.filter(p => p.data.slice(0, 7) === Cal.mes && filtraConta(p.conta));
  const eventosMes = () => Store.eventos.filter(e => String(e.data).slice(0, 7) === Cal.mes &&
    (Cal.conta === "Todas" || e.conta === Cal.conta || e.conta === "Ambas" || e.conta === "Interno"));

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
  const evChip = e => `<button type="button" class="evchip" data-cal-ev="${esc(e.id)}"><span aria-hidden="true">${TIPOS[e.tipo] || "📌"}</span><span class="evchip-t">${esc(e.titulo)}</span></button>`;
  function cardPost(p) {
    return `<button type="button" class="pcard c-${p.conta}" data-cal-post="${esc(p.id)}">
      <span class="pc-top">${ctag(p.conta)}<span class="pc-fmt">${esc(p.formato)}</span></span>
      <span class="pc-tema">${esc(p.tema)}</span>
      <span class="pc-bot">${stPill(p.status)}${selo(Store.decisao(p.id))}</span></button>`;
  }
  const nPosts = n => n ? `${n} ${n > 1 ? "posts" : "post"}` : "";

  function htmlCalendario() {
    const ps = postsMes(), evs = eventosMes(), on = Store.mode !== "off", hoje = hojeSP();
    const ap = ps.filter(p => Store.decisao(p.id) === "aprovado").length;
    const aj = ps.filter(p => Store.decisao(p.id) === "ajustar").length;
    const meses = []; for (let m = MES_MIN; m <= mesMax(); m = addMes(m, 1)) meses.push(m);
    const porDia = {};
    ps.forEach(p => (porDia[p.data] = porDia[p.data] || { p: [], e: [] }).p.push(p));
    evs.forEach(e => { const d = String(e.data).slice(0, 10); (porDia[d] = porDia[d] || { p: [], e: [] }).e.push(e); });

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
      const ds = `${Cal.mes}-${String(d).padStart(2, "0")}`, x = porDia[ds] || { p: [], e: [] };
      cels.push(`<div class="cd${ds === hoje ? " hoje" : ""}${ds < hoje ? " passado" : ""}" aria-label="${extenso(ds)}">
        <div class="cd-top"><span class="cd-n">${d}</span><span class="cd-c">${nPosts(x.p.length)}</span>${addBtn(ds)}</div>
        ${x.e.map(evChip).join("")}${x.p.map(cardPost).join("")}</div>`);
    }
    while (cels.length % 7) cels.push(`<div class="cd fora" aria-hidden="true"></div>`);

    // lista (celular)
    const dias = Object.keys(porDia).sort();
    const lista = dias.length ? dias.map(d => {
      const x = porDia[d];
      return `<section class="ld${d === hoje ? " hoje" : ""}"><div class="ld-h"><span class="ld-d">${cap(extenso(d))}</span>${d === hoje ? `<span class="ld-hoje">hoje</span>` : ""}<span class="cd-c">${nPosts(x.p.length)}</span>${addBtn(d)}</div>
        ${x.e.map(evChip).join("")}${x.p.map(cardPost).join("")}</section>`;
    }).join("") : `<div class="empty">Nenhum post ${Cal.conta === "Todas" ? "" : "desta conta "}neste mês.</div>`;

    const v = n => on ? n : "–";
    return `<div class="cal">
      <div class="cal-head">
        <div><h2>${cap(mesNome(Cal.mes))}</h2><p class="lead">Tanyno Oficial posta terça, quarta e quinta. Tanyno Glass posta terça e quinta.</p></div>
        ${Store.pode() ? `<button type="button" class="btn-pri" data-cal-add="${Cal.mes === hoje.slice(0, 7) ? hoje : Cal.mes + "-01"}">+ Novo evento</button>` : ""}
      </div>
      <div class="cal-bar">
        <div class="seg" role="group" aria-label="Filtrar por conta">
          ${["Todas", "Oficial", "Glass"].map(c => `<button type="button" class="seg-b sb-${c}" data-cal-conta="${c}" aria-pressed="${Cal.conta === c}">${c === "Todas" ? "Todas" : CONTA_NOME[c]}</button>`).join("")}
        </div>
        <div class="mes-nav">
          <button type="button" class="mn-b" data-cal-mes="-1" aria-label="Mês anterior" ${Cal.mes <= MES_MIN ? "disabled" : ""}>‹</button>
          <select class="mn-sel" data-cal-sel aria-label="Escolher o mês">${meses.map(x => `<option value="${x}"${x === Cal.mes ? " selected" : ""}>${cap(mesNome(x))}</option>`).join("")}</select>
          <button type="button" class="mn-b" data-cal-mes="1" aria-label="Próximo mês" ${Cal.mes >= mesMax() ? "disabled" : ""}>›</button>
          <button type="button" class="mn-hoje" data-cal-hoje>Hoje</button>
        </div>
      </div>
      <div class="stats cal-stats">
        <div class="stat"><b>${ps.length}</b><span>Posts no mês</span></div>
        <div class="stat st-ok"><b>${v(ap)}</b><span>Aprovados</span></div>
        <div class="stat st-aj"><b>${v(aj)}</b><span>Para ajustar</span></div>
        <div class="stat"><b>${v(ps.length - ap - aj)}</b><span>Aguardando</span></div>
      </div>
      ${aviso ? `<p class="cal-aviso" role="status">${aviso}</p>` : ""}
      <div class="cal-grid" role="grid" aria-label="${cap(mesNome(Cal.mes))}">
        ${DIAS_CURTOS.map((d, i) => `<div class="cg-h" role="columnheader" aria-label="${DIAS[i]}">${d}</div>`).join("")}
        ${cels.join("")}
      </div>
      <div class="cal-lista">${lista}</div>
    </div>`;
  }

  /* ---------- janelas ---------- */
  const campo = (rot, v) => v ? `<div class="dl-i"><dt>${esc(rot)}</dt><dd>${esc(v)}</dd></div>` : "";
  const fechar = `<button type="button" class="dlg-x" data-dlg-close aria-label="Fechar">✕</button>`;

  function htmlPost(p) {
    const lista = postsMes(), i = lista.findIndex(x => x.id === p.id);
    const dec = Store.decisao(p.id), hist = Store.historico(p.id), pode = Store.pode();
    const ant = i > 0 ? lista[i - 1].id : "", prox = i >= 0 && i < lista.length - 1 ? lista[i + 1].id : "";
    let apr;
    if (Store.mode === "off") {
      apr = `<p class="muted">Aprovações indisponíveis no momento.</p>`;
    } else {
      apr = `<div class="apr-btns">
          <button type="button" class="btn-ok" data-apr="aprovado" ${pode ? "" : "disabled"}>✅ Aprovado</button>
          <button type="button" class="btn-aj" data-apr="ajustar" ${pode ? "" : "disabled"}>✏️ Ajustar</button>
        </div>
        ${pode ? "" : Store.user ? `<p class="muted">Este e-mail não tem permissão para aprovar.</p>` : `<p class="apr-login"><button type="button" class="link" data-cal-login>Entre para aprovar</button></p>`}
        <form class="apr-form" data-apr-form hidden>
          <label for="apr-txt">O que precisa ajustar?</label>
          <textarea id="apr-txt" name="comentario" rows="3" required></textarea>
          <div class="row"><button type="submit" class="btn-aj">Enviar ajuste</button><button type="button" class="btn-sec" data-apr-cancel>Cancelar</button></div>
        </form>
        <div class="hist"><h4>Histórico</h4>${hist.length ? `<ol>${hist.map(h => `<li>${selo(h.decisao)} <b>${esc(h.autor || "")}</b> <span class="muted">· ${quando(h.criado_em)}</span>${h.comentario ? `<p>${esc(h.comentario)}</p>` : ""}</li>`).join("")}</ol>` : `<p class="muted">Nenhuma decisão ainda.</p>`}</div>`;
    }
    return `<div class="dlg-h"><div class="dlg-meta">${ctag(p.conta, CONTA_NOME[p.conta])}<span class="dlg-data">${cap(extenso(p.data))}</span></div>${fechar}</div>
      <h3 class="dlg-t" id="dlg-titulo">${esc(p.tema)}</h3>
      <div class="dlg-tags"><span class="pc-fmt">${esc(p.formato)}</span>${stPill(p.status)}</div>
      <dl class="dlg-dl">${campo("Ideia do post", p.ideia)}${campo("Gancho (1ª frase)", p.gancho)}${campo(p.conta === "Glass" ? "Vinho que aparece" : "Rótulo ou vinho", p.rotulo)}${campo("CTA", p.cta)}</dl>
      <section class="apr" aria-label="Aprovação"><h4>Aprovação ${selo(dec)}</h4>${apr}</section>
      <div class="dlg-nav">
        <button type="button" class="btn-sec" data-nav="${ant}" ${ant ? "" : "disabled"}>‹ Anterior</button>
        <span class="muted">${i + 1} de ${lista.length}</span>
        <button type="button" class="btn-sec" data-nav="${prox}" ${prox ? "" : "disabled"}>Próximo ›</button>
      </div>`;
  }

  function htmlEvento(e) {
    const pode = Store.pode();
    return `<div class="dlg-h"><div class="dlg-meta"><span class="ev-ic" aria-hidden="true">${TIPOS[e.tipo] || "📌"}</span><span class="dlg-data">${cap(extenso(String(e.data).slice(0, 10)))}</span></div>${fechar}</div>
      <h3 class="dlg-t" id="dlg-titulo">${esc(e.titulo)}</h3>
      <div class="dlg-tags"><span class="pc-fmt">${esc(e.tipo)}</span>${ctag(e.conta, CONTAS_EV[e.conta])}</div>
      ${e.descricao ? `<p class="ev-desc">${esc(e.descricao)}</p>` : ""}
      <p class="muted small">Criado por ${esc(e.criado_por || "")}${e.criado_em ? " em " + quando(e.criado_em) : ""}</p>
      ${pode ? `<div class="row"><button type="button" class="btn-pri" data-ev-edit="${esc(e.id)}">Editar</button><button type="button" class="btn-del" data-ev-del="${esc(e.id)}">Apagar</button></div>`
        : !Store.user ? `<p class="apr-login"><button type="button" class="link" data-cal-login>Entre para editar</button></p>` : ""}`;
  }

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
      <p class="muted">Você recebe um link de acesso no e-mail. Abra o link neste mesmo aparelho e navegador.</p>
      <label class="fl">E-mail<input type="email" name="email" required autocomplete="email"></label>
      <div class="row"><button type="submit" class="btn-pri">Enviar link de acesso</button></div>
      <p class="form-msg" role="status"></p>
    </form>`;
  }

  function abre(tipo, id, extra) {
    if (!Cal.dlg) {
      Cal.dlg = document.createElement("dialog");
      Cal.dlg.className = "cal-dlg";
      Cal.dlg.setAttribute("aria-labelledby", "dlg-titulo");
      document.body.appendChild(Cal.dlg);
      Cal.dlg.addEventListener("click", onDlgClick);
      Cal.dlg.addEventListener("submit", onDlgSubmit);
      Cal.dlg.addEventListener("close", () => { Cal.aberto = null; if (Cal.ultimoFoco && document.contains(Cal.ultimoFoco)) Cal.ultimoFoco.focus(); });
    }
    if (!Cal.dlg.open) Cal.ultimoFoco = document.activeElement;
    Cal.aberto = { tipo, id, extra };
    desenhaDlg();
    if (!Cal.dlg.open) Cal.dlg.showModal();
    const alvo = Cal.dlg.querySelector("input,textarea") || Cal.dlg.querySelector(".dlg-x");
    if (alvo && tipo !== "post" && tipo !== "evento") alvo.focus();
  }

  function desenhaDlg() {
    const a = Cal.aberto; if (!a || !Cal.dlg) return;
    let h = "";
    if (a.tipo === "post") { const p = Cal.posts.find(x => x.id === a.id); if (!p) return Cal.dlg.close(); h = htmlPost(p); }
    else if (a.tipo === "evento") { const e = Store.eventos.find(x => String(x.id) === String(a.id)); if (!e) return Cal.dlg.close(); h = htmlEvento(e); }
    else if (a.tipo === "form") h = htmlForm(a.extra || {});
    else if (a.tipo === "login") h = htmlLogin();
    Cal.dlg.innerHTML = `<div class="dlg-in">${h}</div>`;
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
    if (b.dataset.apr === "aprovado") {
      b.disabled = true;
      try { await Store.addAprov(Cal.aberto.id, "aprovado", ""); notify(); }
      catch (e) { alert(erroMsg(e)); b.disabled = false; }
      return;
    }
    if (b.dataset.apr === "ajustar") {
      const f = Cal.dlg.querySelector("[data-apr-form]"); f.hidden = false; f.querySelector("textarea").focus(); return;
    }
    if (b.hasAttribute("data-apr-cancel")) { const f = Cal.dlg.querySelector("[data-apr-form]"); f.hidden = true; f.reset(); return; }
    if (b.dataset.evEdit) { const e = Store.eventos.find(x => String(x.id) === b.dataset.evEdit); abre("form", null, Object.assign({}, e)); return; }
    if (b.dataset.evDel) {
      const e = Store.eventos.find(x => String(x.id) === b.dataset.evDel);
      if (!confirm(`Apagar o evento "${e ? e.titulo : ""}"? Isso não pode ser desfeito.`)) return;
      try { await Store.delEvento(b.dataset.evDel); Cal.dlg.close(); notify(); }
      catch (err) { alert(erroMsg(err)); }
    }
  }

  async function onDlgSubmit(ev) {
    ev.preventDefault();
    const f = ev.target, msg = f.querySelector(".form-msg");
    const btn = f.querySelector("button[type=submit]");
    if (f.hasAttribute("data-apr-form")) {
      const txt = f.comentario.value.trim();
      if (!txt) { f.comentario.focus(); return; }
      btn.disabled = true;
      try { await Store.addAprov(Cal.aberto.id, "ajustar", txt); notify(); }
      catch (e) { alert(erroMsg(e)); btn.disabled = false; }
      return;
    }
    if (f.hasAttribute("data-ev-form")) {
      const d = { id: f.dataset.id || null, titulo: f.titulo.value.trim(), data: f.data.value, tipo: f.tipo.value, conta: f.conta.value, descricao: f.descricao.value.trim() };
      if (!d.titulo || !d.data) return;
      btn.disabled = true;
      try {
        await Store.saveEvento(d);
        const salvo = d.id ? d.id : (Store.eventos.filter(x => x.titulo === d.titulo && String(x.data).slice(0, 10) === d.data).pop() || {}).id;
        if (d.data.slice(0, 7) !== Cal.mes) Cal.mes = clampMes(d.data.slice(0, 7));
        notify();
        if (salvo) abre("evento", salvo); else Cal.dlg.close();
      } catch (e) { msg.textContent = erroMsg(e); btn.disabled = false; }
      return;
    }
    if (f.hasAttribute("data-login-form")) {
      btn.disabled = true; msg.textContent = "Enviando…";
      try { await Store.signIn(f.email.value.trim()); msg.textContent = `Pronto. Confira a caixa de entrada de ${f.email.value.trim()} e clique no link.`; }
      catch (e) { msg.textContent = "Não foi possível enviar o link: " + (e.message || e); btn.disabled = false; }
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
    if (foco) { // devolve o foco ao mesmo controle depois de redesenhar
      const k = Object.keys(foco).find(x => x.startsWith("cal"));
      if (k) { const attr = "data-" + k.replace(/[A-Z]/g, c => "-" + c.toLowerCase()); const el = Cal.root.querySelector(`[${attr}="${CSS.escape(foco[k])}"]`); if (el) el.focus(); }
    }
  }

  function renderAuth() {
    const el = document.getElementById("auth"); if (!el) return;
    if (Store.mode === "off") { el.innerHTML = ""; return; }
    if (Store.user) {
      el.innerHTML = `<span class="auth-who" title="${esc(Store.user.email)}">${esc(Store.user.nome || Store.user.email)}</span><button type="button" class="auth-b" data-auth-out>Sair</button>`;
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
    init(posts) {
      Cal.posts = Array.isArray(posts) ? posts.filter(p => p && p.data && p.id) : [];
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
    get store() { return Store; }
  };
  window.Calendario = api;
})();
