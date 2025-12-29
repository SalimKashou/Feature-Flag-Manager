/* Feature Flag Manager (Static)
 * - No build tools
 * - LocalStorage persistence
 * - Features + env toggles
 * - Audience targeting (All/Clients/Groups)
 * - Group editor
 * - Change log (local)
 * - Sticky header + footer
 *
 * Kill switches removed entirely.
 */

(function () {
  const ENVIRONMENTS = ["Dev", "Test", "Ops", "Stage", "Prod"];
  const STORAGE_KEY = "pm-ffm:static:v2";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const uid = () => Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  const nowISO = () => new Date().toISOString();

  function clampText(s, max = 60) {
    if (!s) return "";
    return s.length <= max ? s : s.slice(0, max - 1) + "…";
  }

  function defaultEnv() {
    return { Dev: true, Test: true, Ops: false, Stage: false, Prod: false };
  }

  function seedState() {
    const clients = [
      { id: "c-aurora", name: "Aurora REIT" },
      { id: "c-bayview", name: "Bayview Capital" },
      { id: "c-cypress", name: "Cypress Holdings" },
    ];

    const groups = [{ id: "g-beta", name: "Beta Participants", clientIds: ["c-aurora"] }];

    const features = [
      {
        id: uid(),
        key: "audit_trail_v2",
        name: "Audit Trail v2",
        description: "New audit timeline",
        tags: ["Compliance"],
        env: { Dev: true, Test: true, Ops: false, Stage: true, Prod: false },
        targeting: { mode: "groups", clientIds: [], groupIds: ["g-beta"] },
        notes: "Beta rollout",
        updatedAt: nowISO(),
      },
    ];

    return {
      currentUser: "PM",
      clients,
      groups,
      features,
      selectedFeatureId: features[0]?.id || null,
      changeLog: [],
    };
  }

  function safeParse(json) {
    try { return JSON.parse(json); } catch { return null; }
  }

  function hydrate() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== "object") return seedState();

    // Minimal coercion to avoid crashes
    const s = seedState();
    const state = {
      currentUser: typeof parsed.currentUser === "string" && parsed.currentUser.trim() ? parsed.currentUser.trim() : s.currentUser,
      clients: Array.isArray(parsed.clients) ? parsed.clients : s.clients,
      groups: Array.isArray(parsed.groups) ? parsed.groups : s.groups,
      features: Array.isArray(parsed.features) ? parsed.features : s.features,
      selectedFeatureId: typeof parsed.selectedFeatureId === "string" ? parsed.selectedFeatureId : s.selectedFeatureId,
      changeLog: Array.isArray(parsed.changeLog) ? parsed.changeLog : [],
    };

    // ensure env + targeting exist for each feature
    state.features = state.features
      .filter((f) => f && f.id && f.key && f.name)
      .map((f) => ({
        ...f,
        env: (f.env && typeof f.env === "object") ? normalizeEnv(f.env) : defaultEnv(),
        targeting: normalizeTargeting(f.targeting),
        tags: Array.isArray(f.tags) ? f.tags : [],
        updatedAt: typeof f.updatedAt === "string" ? f.updatedAt : nowISO(),
      }));

    if (!state.features.length) return seedState();
    if (!state.features.some((f) => f.id === state.selectedFeatureId)) state.selectedFeatureId = state.features[0].id;

    return state;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeEnv(raw) {
    const base = defaultEnv();
    for (const env of ENVIRONMENTS) base[env] = !!raw[env];
    return base;
  }

  function normalizeTargeting(raw) {
    const mode = raw?.mode === "clients" || raw?.mode === "groups" ? raw.mode : "all";
    const clientIds = Array.isArray(raw?.clientIds) ? raw.clientIds.map(String).filter(Boolean) : [];
    const groupIds = Array.isArray(raw?.groupIds) ? raw.groupIds.map(String).filter(Boolean) : [];

    if (mode === "clients") return { mode, clientIds, groupIds: [] };
    if (mode === "groups") return { mode, clientIds: [], groupIds };
    return { mode: "all", clientIds: [], groupIds: [] };
  }

  function formatUpdated(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function effectiveAudience(feature) {
    if (!feature) return "ALL";
    if (feature.targeting.mode === "all") return "ALL";
    if (feature.targeting.mode === "clients") return [...new Set(feature.targeting.clientIds || [])];

    const set = new Set();
    for (const gid of feature.targeting.groupIds || []) {
      const g = state.groups.find((x) => x.id === gid);
      (g?.clientIds || []).forEach((cid) => set.add(cid));
    }
    return [...set];
  }

  function log(featureId, what) {
    state.changeLog = [
      {
        id: uid(),
        when: nowISO(),
        who: (state.currentUser || "PM").trim() || "PM",
        featureId: featureId ?? null,
        what,
      },
      ...(state.changeLog || []),
    ].slice(0, 200);
    persist();
  }

  function toast(msg) {
    const wrap = $(".toastWrap");
    const el = $(".toast");
    el.textContent = msg;
    wrap.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => wrap.classList.remove("show"), 2200);
  }

  // ---------- Rendering ----------
  let state = hydrate();
  const root = $("#app");

  function render() {
    const selected = state.features.find((f) => f.id === state.selectedFeatureId) || null;

    root.innerHTML = `
      <div class="container">
        <div class="header">
          <div class="headerRow ${window.scrollY > 8 ? "compact" : ""}">
            <div>
              <div class="hTitle">Feature Flag Manager</div>
              <div class="hSub">Lightweight PM console • Local prototype</div>
            </div>

            <div class="headerActions">
              <div class="userPill">
                <label>User</label>
                <input id="userInput" value="${escapeHtml(state.currentUser)}" placeholder="e.g., Salim" />
              </div>
              <button class="btn" id="groupsBtn">Groups</button>
              <button class="btn btnPrimary" id="addFeatureBtn">+ Add feature</button>
            </div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="listSearch">
              <input class="input" id="searchInput" placeholder="Search flags…" value="${escapeHtml(ui.query || "")}" />
            </div>
            <div class="list" id="featureList"></div>
          </div>

          <div id="detailPane">
            ${selected ? renderDetail(selected) : `<div class="card"><div class="cardBody" style="color:#475569;">No feature selected.</div></div>`}
          </div>
        </div>

        <div class="footer">
          Version 1.0. Created by
          <a href="https://github.com/SalimKashou" target="_blank" rel="noopener noreferrer">Salim Kashou</a>
          using ChatGPT. Not for profit.
        </div>
      </div>

      <div class="toastWrap"><div class="toast"></div></div>

      ${renderFeatureModal()}
      ${renderGroupsModal()}
    `;

    renderFeatureList();
    wireEvents();
  }

  const ui = { query: "" };

  function renderFeatureList() {
    const q = (ui.query || "").trim().toLowerCase();
    const filtered = !q
      ? state.features
      : state.features.filter((f) => `${f.name} ${f.key} ${f.description || ""} ${(f.tags || []).join(" ")}`.toLowerCase().includes(q));

    const list = $("#featureList");
    list.innerHTML = filtered
      .map((f, idx) => {
        const active = f.id === state.selectedFeatureId;
        const prodOn = !!f.env?.Prod;
        return `
          <div class="listDivider"></div>
          <button class="listItemBtn ${active ? "active" : ""}" data-select-feature="${f.id}">
            <div style="display:flex;justify-content:space-between;gap:12px;">
              <div style="min-width:0;">
                <div style="font-weight:900;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.name)}</div>
                <div class="mono" style="font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.key)}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                <span class="badge">${prodOn ? "Prod ON" : "Prod OFF"}</span>
              </div>
            </div>
            ${f.description ? `<div style="margin-top:8px;font-size:12px;color:#475569;">${escapeHtml(clampText(f.description, 90))}</div>` : ""}
          </button>
        `;
      })
      .join("");
  }

  function renderDetail(feature) {
    const eff = effectiveAudience(feature);
    const effHtml =
      eff === "ALL"
        ? `<div style="font-size:14px;color:#334155;">All clients</div>`
        : eff.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${eff.map((cid) => {
              const c = state.clients.find((x) => x.id === cid);
              return `<span class="badge">${escapeHtml(c?.name || cid)}</span>`;
            }).join("")}</div>`
          : `<div style="font-size:14px;color:#64748b;">None selected.</div>`;

    return `
      <div class="card">
        <div class="cardHeader">
          <div class="cardTitle">Overview</div>
          <div style="display:flex;gap:8px;">
            <button class="btn btnSmall" data-edit-feature="${feature.id}">Edit</button>
            <button class="btn btnSmall btnDanger" data-delete-feature="${feature.id}">Delete</button>
          </div>
        </div>
        <div class="cardBody">
          <div class="sectionGrid2">
            <div>
              <div style="font-size:18px;font-weight:900;">${escapeHtml(feature.name)}</div>
              <div class="badge mono" style="margin-top:8px;display:inline-flex;">${escapeHtml(feature.key)}</div>
              <div style="margin-top:10px;color:#334155;">
                ${feature.description ? escapeHtml(feature.description) : `<span style="color:#64748b;">No description.</span>`}
              </div>

              <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
                ${(feature.tags || []).map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("")}
              </div>

              <div style="margin-top:10px;font-size:12px;color:#64748b;">
                Last updated: ${escapeHtml(formatUpdated(feature.updatedAt))}
              </div>
            </div>

            <div class="note">
              <div style="font-weight:900;">Quick status</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
                <div class="card" style="padding:12px;box-shadow:none;">
                  <div style="font-size:12px;color:#64748b;">Prod</div>
                  <div style="margin-top:4px;font-weight:900;">${feature.env.Prod ? "Enabled" : "Disabled"}</div>
                </div>
                <div class="card" style="padding:12px;box-shadow:none;">
                  <div style="font-size:12px;color:#64748b;">Targeting</div>
                  <div style="margin-top:4px;font-weight:900;text-transform:capitalize;">${escapeHtml(feature.targeting.mode || "all")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="cardHeader">
          <div class="cardTitle">Environments</div>
          <div style="font-size:12px;color:#64748b;">Per environment ON/OFF</div>
        </div>
        <div class="cardBody">
          <div class="sectionGrid2">
            ${ENVIRONMENTS.map((env) => `
              <div class="card" style="box-shadow:none;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
                <div>
                  <div style="font-weight:900;font-size:14px;">${env}</div>
                  <div style="font-size:12px;color:#64748b;">
                    Status: <span class="${feature.env[env] ? "statusOn" : ""}">${feature.env[env] ? "ON" : "OFF"}</span>
                  </div>
                </div>
                ${renderToggle(`env:${feature.id}:${env}`, !!feature.env[env])}
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="cardHeader">
          <div class="cardTitle">Audience targeting</div>
          <div style="font-size:12px;color:#64748b;">All / specific clients / groups</div>
        </div>
        <div class="cardBody">
          <div class="pills">
            ${renderTargetPill(feature, "all", "All clients")}
            ${renderTargetPill(feature, "clients", "Specific clients")}
            ${renderTargetPill(feature, "groups", "Groups")}
          </div>

          <div style="margin-top:12px;">
            ${renderTargetEditor(feature)}
          </div>

          <div class="note" style="margin-top:12px;">
            <div style="font-weight:900;">Effective audience</div>
            <div style="margin-top:8px;">${effHtml}</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="cardHeader">
          <div class="cardTitle">Notes</div>
        </div>
        <div class="cardBody">
          <textarea class="textarea" id="notesArea" placeholder="Optional rollout notes, dependencies, links, etc.">${escapeHtml(feature.notes || "")}</textarea>
          <div style="margin-top:10px;display:flex;justify-content:flex-end;">
            <button class="btn btnSmall" id="saveNotesBtn">Save notes</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="cardHeader">
          <div class="cardTitle">Change log</div>
          <div style="font-size:12px;color:#64748b;">Showing latest 20</div>
        </div>
        <div class="cardBody" id="changeLogPane">
          ${renderChangeLog(feature)}
        </div>
      </div>
    `;
  }

  function renderChangeLog(feature) {
    const all = state.changeLog || [];
    const filtered = all.filter((e) => e.featureId === feature.id || e.featureId === null);
    if (!filtered.length) return `<div style="color:#475569;">No changes logged yet.</div>`;

    return filtered.slice(0, 20).map((e) => `
      <div class="card" style="box-shadow:none;padding:14px;margin-bottom:10px;">
        <div style="font-size:14px;">${escapeHtml(e.what)}</div>
        <div style="margin-top:6px;font-size:12px;color:#64748b;">
          <span style="font-weight:900;">${escapeHtml(e.who)}</span> • ${escapeHtml(formatUpdated(e.when))}
          ${e.featureId === null ? " • Global" : ""}
        </div>
      </div>
    `).join("");
  }

  function renderTargetPill(feature, mode, label) {
    const active = (feature.targeting?.mode || "all") === mode;
    return `<button class="pill ${active ? "active" : ""}" data-target-mode="${mode}">${label}</button>`;
  }

  function renderTargetEditor(feature) {
    const mode = feature.targeting?.mode || "all";
    if (mode === "all") {
      return `<div class="note">This feature applies to all clients.</div>`;
    }

    if (mode === "clients") {
      return `
        <div class="card" style="box-shadow:none;">
          <div class="cardHeader">
            <div class="cardTitle">Select clients</div>
            <div style="font-size:12px;color:#64748b;">Click to include</div>
          </div>
          <div class="cardBody">
            <div class="sectionGrid2">
              ${state.clients.map((c) => {
                const checked = (feature.targeting.clientIds || []).includes(c.id);
                return `
                  <label class="checkCard">
                    <div class="meta">
                      <div class="name">${escapeHtml(c.name)}</div>
                      <div class="sub">${escapeHtml(c.id)}</div>
                    </div>
                    <input type="checkbox" data-client-check="${c.id}" ${checked ? "checked" : ""} />
                  </label>
                `;
              }).join("")}
            </div>
            <div style="margin-top:10px;font-size:12px;color:#64748b;">Tip: use Groups if you don’t want to re-check clients every time.</div>
          </div>
        </div>
      `;
    }

    // groups
    if (!state.groups.length) {
      return `<div class="note">No groups yet. Click “Groups” at the top to create one.</div>`;
    }

    return `
      <div class="card" style="box-shadow:none;">
        <div class="cardHeader">
          <div class="cardTitle">Select groups</div>
          <div style="font-size:12px;color:#64748b;">Click to include</div>
        </div>
        <div class="cardBody">
          <div class="sectionGrid2">
            ${state.groups.map((g) => {
              const checked = (feature.targeting.groupIds || []).includes(g.id);
              return `
                <label class="checkCard">
                  <div class="meta">
                    <div class="name">${escapeHtml(g.name)}</div>
                    <div class="sub">${g.clientIds.length} client(s)</div>
                  </div>
                  <input type="checkbox" data-group-check="${g.id}" ${checked ? "checked" : ""} />
                </label>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderToggle(id, checked) {
    return `
      <div class="toggle ${checked ? "on" : "off"}" role="switch" aria-checked="${checked}" tabindex="0" data-toggle="${id}">
        <div class="knob ${checked ? "on" : ""}"></div>
      </div>
    `;
  }

  // ---------- Feature Modal ----------
  const modalState = {
    featureOpen: false,
    editingFeatureId: null,
    groupsOpen: false,
    selectedGroupId: null,
  };

  function renderFeatureModal() {
    const open = modalState.featureOpen;
    const isEdit = !!modalState.editingFeatureId;
    const feature = isEdit ? state.features.find((f) => f.id === modalState.editingFeatureId) : null;

    const draft = feature
      ? { ...feature, tags: (feature.tags || []).slice() }
      : { id: uid(), key: "", name: "", description: "", tags: [], env: defaultEnv(), targeting: { mode: "all", clientIds: [], groupIds: [] }, notes: "", updatedAt: nowISO() };

    // store draft in memory for event handlers
    window.__draft = draft;

    return `
      <div class="modalOverlay ${open ? "open" : ""}" id="featureModalOverlay">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${isEdit ? "Edit feature" : "Add feature"}">
          <div class="modalHeader">
            <div class="modalTitle">${isEdit ? "Edit feature" : "Add feature"}</div>
            <button class="btn btnSmall" id="closeFeatureModal">✕</button>
          </div>

          <div class="modalBody">
            <div class="sectionGrid2">
              <div>
                <div style="font-size:13px;font-weight:900;margin-bottom:6px;">Feature name *</div>
                <input class="input" id="fm_name" value="${escapeHtml(draft.name)}" placeholder="e.g., Audit Trail v2" />
              </div>
              <div>
                <div style="font-size:13px;font-weight:900;margin-bottom:6px;">Flag key *</div>
                <input class="input mono" id="fm_key" value="${escapeHtml(draft.key)}" placeholder="e.g., audit_trail_v2" />
              </div>
            </div>

            <div style="margin-top:12px;">
              <div style="font-size:13px;font-weight:900;margin-bottom:6px;">Description</div>
              <textarea class="textarea" id="fm_desc" rows="3">${escapeHtml(draft.description || "")}</textarea>
            </div>

            <div style="margin-top:12px;">
              <div style="font-size:13px;font-weight:900;margin-bottom:6px;">Tags</div>
              <input class="input" id="fm_tags" value="${escapeHtml((draft.tags || []).join(", "))}" placeholder="Comma-separated" />
            </div>

            <div class="note" style="margin-top:12px;">
              <div style="font-weight:900;">Environment defaults</div>
              <div class="sectionGrid2" style="margin-top:10px;">
                ${ENVIRONMENTS.map((env) => `
                  <div class="card" style="box-shadow:none;padding:12px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-weight:900;">${env}</div>
                    ${renderToggle(`fm_env:${env}`, !!draft.env[env])}
                  </div>
                `).join("")}
              </div>
            </div>

            <div style="margin-top:12px;">
              <div style="font-size:13px;font-weight:900;margin-bottom:6px;">Notes</div>
              <textarea class="textarea" id="fm_notes" rows="4">${escapeHtml(draft.notes || "")}</textarea>
            </div>
          </div>

          <div class="modalFooter">
            <button class="btn" id="cancelFeatureModal">Cancel</button>
            <button class="btn btnPrimary" id="saveFeatureModal">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Groups Modal ----------
  function renderGroupsModal() {
    const open = modalState.groupsOpen;
    const selectedGroup = state.groups.find((g) => g.id === modalState.selectedGroupId) || null;

    return `
      <div class="modalOverlay ${open ? "open" : ""}" id="groupsModalOverlay">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Group editor">
          <div class="modalHeader">
            <div class="modalTitle">Group editor</div>
            <button class="btn btnSmall" id="closeGroupsModal">✕</button>
          </div>

          <div class="modalBody">
            <div class="sectionGrid2" style="grid-template-columns: 1fr 2fr;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                  <div style="font-weight:900;">Groups</div>
                  <button class="btn btnSmall" id="addGroupBtn">+ Add</button>
                </div>

                <div class="card" style="box-shadow:none;margin-top:10px;overflow:hidden;">
                  ${state.groups.length ? state.groups.map((g) => {
                    const active = g.id === modalState.selectedGroupId;
                    return `
                      <button class="listItemBtn ${active ? "active" : ""}" data-select-group="${g.id}">
                        <div style="display:flex;justify-content:space-between;gap:12px;">
                          <div style="min-width:0;">
                            <div style="font-weight:900;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(g.name)}</div>
                            <div style="font-size:12px;color:#64748b;">${g.clientIds.length} client(s)</div>
                          </div>
                          <span class="badge">Group</span>
                        </div>
                      </button>
                      <div class="listDivider"></div>
                    `;
                  }).join("") : `<div class="cardBody" style="color:#475569;">No groups yet.</div>`}
                </div>
              </div>

              <div>
                ${selectedGroup ? `
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                    <div style="font-weight:900;">Edit group</div>
                    <button class="btn btnSmall btnDanger" id="deleteGroupBtn">Delete</button>
                  </div>

                  <div style="margin-top:10px;">
                    <div style="font-size:13px;font-weight:900;margin-bottom:6px;">Group name</div>
                    <input class="input" id="groupNameInput" value="${escapeHtml(selectedGroup.name)}" />
                  </div>

                  <div class="card" style="box-shadow:none;margin-top:12px;">
                    <div class="cardHeader">
                      <div class="cardTitle">Clients</div>
                      <div style="font-size:12px;color:#64748b;">Assign to group</div>
                    </div>
                    <div class="cardBody">
                      <div class="sectionGrid2">
                        ${state.clients.map((c) => {
                          const checked = selectedGroup.clientIds.includes(c.id);
                          return `
                            <label class="checkCard">
                              <div class="meta">
                                <div class="name">${escapeHtml(c.name)}</div>
                                <div class="sub">${escapeHtml(c.id)}</div>
                              </div>
                              <input type="checkbox" data-group-client="${c.id}" ${checked ? "checked" : ""} />
                            </label>
                          `;
                        }).join("")}
                      </div>
                    </div>
                  </div>

                  <div style="margin-top:10px;font-size:12px;color:#64748b;">Tip: groups can be used in feature targeting.</div>
                ` : `<div class="note">Select a group to edit.</div>`}
              </div>
            </div>
          </div>

          <div class="modalFooter" style="justify-content:space-between;">
            <div style="font-size:12px;color:#64748b;align-self:center;">Create groups and assign clients (saved locally).</div>
            <div style="display:flex;gap:8px;">
              <button class="btn" id="cancelGroupsModal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Events ----------
  function wireEvents() {
    // sticky header compact toggle
    window.addEventListener("scroll", onScrollOnce, { passive: true });

    // user
    $("#userInput").addEventListener("input", (e) => {
      state.currentUser = e.target.value;
      persist();
    });

    // search
    $("#searchInput").addEventListener("input", (e) => {
      ui.query = e.target.value;
      renderFeatureList();
      // no need full re-render
    });

    // select feature
    $$("[data-select-feature]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedFeatureId = btn.getAttribute("data-select-feature");
        persist();
        render();
      });
    });

    // open modals
    $("#addFeatureBtn").addEventListener("click", () => {
      modalState.featureOpen = true;
      modalState.editingFeatureId = null;
      render();
      wireModalEvents();
    });

    $("#groupsBtn").addEventListener("click", () => {
      modalState.groupsOpen = true;
      modalState.selectedGroupId = state.groups[0]?.id || null;
      render();
      wireGroupsModalEvents();
    });

    // detail actions
    $$("[data-edit-feature]").forEach((btn) => {
      btn.addEventListener("click", () => {
        modalState.featureOpen = true;
        modalState.editingFeatureId = btn.getAttribute("data-edit-feature");
        render();
        wireModalEvents();
      });
    });

    $$("[data-delete-feature]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-delete-feature");
        const victim = state.features.find((f) => f.id === id);
        if (!confirm(`Delete feature "${victim?.name || id}"?`)) return;

        state.features = state.features.filter((f) => f.id !== id);
        if (state.selectedFeatureId === id) state.selectedFeatureId = state.features[0]?.id || null;
        persist();
        log(id, `Deleted feature “${victim?.name || id}”.`);
        toast("Deleted.");
        render();
      });
    });

    // env toggles
    $$("[data-toggle^='env:']").forEach((t) => {
      t.addEventListener("click", () => onToggleEnv(t));
      t.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleEnv(t); }
      });
    });

    // targeting mode
    $$("[data-target-mode]").forEach((p) => {
      p.addEventListener("click", () => {
        const mode = p.getAttribute("data-target-mode");
        const f = getSelectedFeature();
        if (!f) return;

        if (mode === "all") f.targeting = { mode: "all", clientIds: [], groupIds: [] };
        if (mode === "clients") f.targeting = { mode: "clients", clientIds: f.targeting.clientIds || [], groupIds: [] };
        if (mode === "groups") f.targeting = { mode: "groups", clientIds: [], groupIds: f.targeting.groupIds || [] };

        f.updatedAt = nowISO();
        persist();
        log(f.id, `Updated audience targeting → ${f.targeting.mode}.`);
        toast("Updated.");
        render();
      });
    });

    // client targeting checkboxes
    $$("[data-client-check]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const cid = cb.getAttribute("data-client-check");
        const f = getSelectedFeature();
        if (!f) return;
        const next = new Set(f.targeting.clientIds || []);
        if (cb.checked) next.add(cid);
        else next.delete(cid);
        f.targeting = { mode: "clients", clientIds: [...next], groupIds: [] };
        f.updatedAt = nowISO();
        persist();
        log(f.id, "Updated audience targeting.");
        toast("Updated.");
        render();
      });
    });

    // group targeting checkboxes
    $$("[data-group-check]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const gid = cb.getAttribute("data-group-check");
        const f = getSelectedFeature();
        if (!f) return;
        const next = new Set(f.targeting.groupIds || []);
        if (cb.checked) next.add(gid);
        else next.delete(gid);
        f.targeting = { mode: "groups", clientIds: [], groupIds: [...next] };
        f.updatedAt = nowISO();
        persist();
        log(f.id, "Updated audience targeting.");
        toast("Updated.");
        render();
      });
    });

    // notes
    const notesArea = $("#notesArea");
    const saveNotesBtn = $("#saveNotesBtn");
    if (notesArea && saveNotesBtn) {
      saveNotesBtn.addEventListener("click", () => {
        const f = getSelectedFeature();
        if (!f) return;
        f.notes = notesArea.value;
        f.updatedAt = nowISO();
        persist();
        log(f.id, "Updated notes.");
        toast("Saved.");
        render();
      });
    }

    // modals
    wireModalEvents();
    wireGroupsModalEvents();
  }

  function onScrollOnce() {
    // Re-render header compactness only when it changes
    const shouldCompact = window.scrollY > 8;
    const row = $(".headerRow");
    if (!row) return;
    if (shouldCompact && !row.classList.contains("compact")) row.classList.add("compact");
    if (!shouldCompact && row.classList.contains("compact")) row.classList.remove("compact");
  }

  function getSelectedFeature() {
    return state.features.find((f) => f.id === state.selectedFeatureId) || null;
  }

  function onToggleEnv(t) {
    const parts = t.getAttribute("data-toggle").split(":"); // env:featureId:Env
    const fid = parts[1];
    const env = parts[2];
    const f = state.features.find((x) => x.id === fid);
    if (!f) return;
    f.env[env] = !f.env[env];
    f.updatedAt = nowISO();
    persist();
    log(f.id, `Set ${env} → ${f.env[env] ? "ON" : "OFF"}.`);
    toast("Updated.");
    render();
  }

  function wireModalEvents() {
    const overlay = $("#featureModalOverlay");
    if (!overlay) return;

    // close clicking outside
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeFeatureModal();
    });

    const closeBtn = $("#closeFeatureModal");
    const cancelBtn = $("#cancelFeatureModal");
    if (closeBtn) closeBtn.addEventListener("click", closeFeatureModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeFeatureModal);

    // env toggles in modal
    $$("[data-toggle^='fm_env:']").forEach((t) => {
      t.addEventListener("click", () => {
        const env = t.getAttribute("data-toggle").split(":")[1];
        const d = window.__draft;
        d.env[env] = !d.env[env];
        render();
        wireModalEvents();
      });
    });

    const saveBtn = $("#saveFeatureModal");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const d = window.__draft;

        d.name = ($("#fm_name").value || "").trim();
        d.key = ($("#fm_key").value || "").trim().replace(/\s+/g, "_");
        d.description = $("#fm_desc").value || "";
        d.tags = ($("#fm_tags").value || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 10);
        d.notes = $("#fm_notes").value || "";
        d.updatedAt = nowISO();

        if (!d.name || !d.key) {
          toast("Please fill in all required fields.");
          return;
        }

        const exists = state.features.some((f) => f.id === d.id);
        state.features = exists
          ? state.features.map((f) => (f.id === d.id ? { ...d } : f))
          : [{ ...d }, ...state.features];

        state.selectedFeatureId = d.id;
        persist();
        log(d.id, `Saved feature “${d.name}” (${d.key}).`);
        toast("Saved.");
        closeFeatureModal();
        render();
      });
    }

    window.addEventListener("keydown", escCloseFeatureModalOnce);
  }

  function escCloseFeatureModalOnce(e) {
    if (e.key !== "Escape") return;
    if ($("#featureModalOverlay")?.classList.contains("open")) closeFeatureModal();
  }

  function closeFeatureModal() {
    modalState.featureOpen = false;
    modalState.editingFeatureId = null;
    window.__draft = null;
    render();
  }

  function wireGroupsModalEvents() {
    const overlay = $("#groupsModalOverlay");
    if (!overlay) return;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeGroupsModal();
    });

    const closeBtn = $("#closeGroupsModal");
    const cancelBtn = $("#cancelGroupsModal");
    if (closeBtn) closeBtn.addEventListener("click", closeGroupsModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeGroupsModal);

    // select group
    $$("[data-select-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        modalState.selectedGroupId = btn.getAttribute("data-select-group");
        render();
        wireGroupsModalEvents();
      });
    });

    // add group
    const addBtn = $("#addGroupBtn");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const g = { id: uid(), name: "New group", clientIds: [] };
        state.groups = [g, ...state.groups];
        modalState.selectedGroupId = g.id;
        persist();
        log(null, `Updated client groups (${state.groups.length} total).`);
        toast("Groups saved.");
        render();
        wireGroupsModalEvents();
      });
    }

    const selectedGroup = state.groups.find((g) => g.id === modalState.selectedGroupId) || null;

    // update group name
    const nameInput = $("#groupNameInput");
    if (nameInput && selectedGroup) {
      nameInput.addEventListener("input", () => {
        selectedGroup.name = nameInput.value;
        persist();
      });
      nameInput.addEventListener("change", () => {
        selectedGroup.name = (selectedGroup.name || "").trim() || "Untitled group";
        persist();
        log(null, `Updated client groups (${state.groups.length} total).`);
        toast("Groups saved.");
        render();
        wireGroupsModalEvents();
      });
    }

    // delete group
    const delBtn = $("#deleteGroupBtn");
    if (delBtn && selectedGroup) {
      delBtn.addEventListener("click", () => {
        if (!confirm(`Delete group "${selectedGroup.name}"?`)) return;
        state.groups = state.groups.filter((g) => g.id !== selectedGroup.id);

        // Remove deleted group from any feature targeting
        state.features.forEach((f) => {
          if (f.targeting?.mode === "groups") {
            f.targeting.groupIds = (f.targeting.groupIds || []).filter((id) => id !== selectedGroup.id);
          }
        });

        modalState.selectedGroupId = state.groups[0]?.id || null;
        persist();
        log(null, `Updated client groups (${state.groups.length} total).`);
        toast("Groups saved.");
        render();
        wireGroupsModalEvents();
      });
    }

    // toggle clients in group
    $$("[data-group-client]").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (!selectedGroup) return;
        const cid = cb.getAttribute("data-group-client");
        const set = new Set(selectedGroup.clientIds || []);
        if (cb.checked) set.add(cid);
        else set.delete(cid);
        selectedGroup.clientIds = [...set];
        persist();
        log(null, `Updated client groups (${state.groups.length} total).`);
        toast("Groups saved.");
      });
    });

    window.addEventListener("keydown", escCloseGroupsModalOnce);
  }

  function escCloseGroupsModalOnce(e) {
    if (e.key !== "Escape") return;
    if ($("#groupsModalOverlay")?.classList.contains("open")) closeGroupsModal();
  }

  function closeGroupsModal() {
    modalState.groupsOpen = false;
    modalState.selectedGroupId = null;
    render();
  }

  // ---------- Utils ----------
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Basic "tests" in console ----------
  console.assert(clampText("abcd", 3) === "ab…", "clampText should clamp");
  console.assert(clampText("abc", 3) === "abc", "clampText should not clamp when equal");
  console.assert(JSON.stringify(normalizeTargeting({ mode: "clients", clientIds: ["a"], groupIds: ["g1"] }).groupIds) === "[]", "clients mode clears groupIds");
  console.assert(JSON.stringify(normalizeTargeting({ mode: "groups", clientIds: ["a"], groupIds: ["g1"] }).clientIds) === "[]", "groups mode clears clientIds");

  // ---------- Init ----------
  render();
})();
