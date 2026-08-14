window.__ModuleLoader__.load({
	id: "dsh-skill-mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		const inject = ["slots", "timer"];

		/** Timer service, bound by apply() before any component renders. */
		let timer = null;

		/** Insert one <style> tag (the ModuleLoader bundle has no css pipeline for hand-written plugins). */
		function insertCss(css) {
			if (typeof document === "undefined") return;
			const tagId = "dsh-skill-mcp-manager";
			if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return;
			const tag = document.createElement("style");
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** Same-origin API client for the /api/dsh-skill-mcp route family. */
		function apiCall(method, body) {
			return fetch("/api/dsh-skill-mcp/" + method, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body || {}),
			}).then(r => r.json()).catch(e => ({ ok: false, error: String((e && e.message) || e) }));
		}

		const CSS = `
.smc-page { padding: 14px 16px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.smc-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.smc-tab { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 12px; }
.smc-tab.on { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.smc-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.smc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.smc-name { font-weight: 600; word-break: break-all; }
.smc-title { font-size: 14px; font-weight: 600; }
.smc-click { cursor: pointer; }
.smc-click:hover { background: var(--dsw-alias-bg-layer-2); }
.smc-detail { margin-top: 8px; border-top: 1px dashed var(--dsw-alias-border-l1); padding-top: 8px; }
.smc-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
.smc-mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; word-break: break-all; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
.smc-tag { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.smc-tag.ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.smc-tag.bad { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.smc-tag.warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.smc-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 12px; }
.smc-btn.primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
.smc-btn.danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: transparent; }
.smc-btn:disabled { opacity: .5; cursor: default; }
.smc-input, .smc-select, .smc-textarea { width: 100%; box-sizing: border-box; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: inherit; }
.smc-textarea { min-height: 56px; resize: vertical; font-family: ui-monospace, Consolas, monospace; }
.smc-textarea.big { min-height: 200px; }
.smc-field { margin-bottom: 8px; }
.smc-label { display: block; margin-bottom: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.smc-note { font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.6; margin: 8px 0; }
.smc-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
.smc-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; margin: 8px 0; }
.smc-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.smc-topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.smc-search { flex: 1; min-width: 120px; }
.smc-spacer { flex: 1; }
.smc-toast { position: fixed; right: 16px; bottom: 24px; z-index: 9999; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px 12px; font-size: 12px; color: var(--dsw-alias-label-primary); box-shadow: 0 4px 14px rgba(0,0,0,.25); max-width: 280px; }
.smc-toast.err { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.smc-headrow { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.smc-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 10000; display: flex; align-items: center; justify-content: center; }
.smc-modal { background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 16px; width: 340px; max-width: 90vw; }
.smc-modal-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.smc-status-line { white-space: pre-line; }
`;

		// ------------------------------------------------------------- parse helpers

		function parseKV(text) {
			const out = {};
			for (const raw of String(text || "").split(/\n/)) {
				const line = raw.trim();
				if (!line) continue;
				let kv = null;
				const eq = line.indexOf("=");
				const col = line.indexOf(":");
				if (eq >= 0 && (col < 0 || eq < col)) kv = [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
				else if (col >= 0) kv = [line.slice(0, col).trim(), line.slice(col + 1).trim()];
				if (kv && kv[0]) out[kv[0]] = kv[1];
			}
			return out;
		}
		function toKV(obj) {
			return Object.keys(obj || {}).map(k => k + "=" + obj[k]).join("\n");
		}
		function unquote(s) {
			const v = String(s).trim();
			if (v.length >= 2 && ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
			return v;
		}
		function scalar(v) {
			const s = unquote(v);
			if (s === "true") return true;
			if (s === "false") return false;
			if (/^-?\d+$/.test(s)) return Number(s);
			return s;
		}
		function stripComment(t) {
			const idx = t.indexOf(" #");
			return idx >= 0 ? t.slice(0, idx).trim() : t;
		}
		function isClaudeStyle(obj) {
			const firstVal = Object.values(obj)[0];
			return !!firstVal && typeof firstVal === "object" && !Array.isArray(firstVal)
				&& ("type" in firstVal || "command" in firstVal || "url" in firstVal)
				&& !("serverName" in firstVal) && !("transport" in firstVal);
		}
		function convertClaudeStyle(obj) {
			const out = [];
			for (const [name, v] of Object.entries(obj)) {
				if (!v || typeof v !== "object") continue;
				const s = { serverName: name };
				let type = String(v.type || (v.command ? "stdio" : "streamable-http"));
				if (type === "sse") type = "streamable-http";
				if (type === "http") type = "streamable-http";
				s.transport = type === "stdio" ? "stdio" : "streamable-http";
				if (s.transport === "stdio") {
					if (v.command) s.command = v.command;
					if (Array.isArray(v.args)) s.args = v.args.map(String);
					if (v.env && typeof v.env === "object") s.env = v.env;
					if (v.cwd) s.cwd = v.cwd;
				} else {
					if (v.url) s.url = v.url;
					if (v.headers && typeof v.headers === "object") s.headers = v.headers;
				}
				if (v.toolCallTimeoutMs) s.toolCallTimeoutMs = v.toolCallTimeoutMs;
				if (typeof v.failOnStartupError === "boolean") s.failOnStartupError = v.failOnStartupError;
				if (v.reconnect && typeof v.reconnect === "object") s.reconnect = v.reconnect;
				out.push(normalizeServer(s));
			}
			return out;
		}
		function parseServerText(text) {
			const t = String(text || "").trim();
			if (!t) return { error: "内容为空" };
			try {
				const j = JSON.parse(t);
				if (j && typeof j === "object" && !Array.isArray(j)) {
					if (isClaudeStyle(j)) return { servers: convertClaudeStyle(j) };
					return { servers: [normalizeServer(j)] };
				}
			} catch (e) { /* fall through to YAML-ish */ }
			try {
				return { servers: [parseYamlish(t)] };
			} catch (e) {
				return { error: String((e && e.message) || e) };
			}
		}
		function parseYamlish(text) {
			const out = {};
			let listKey = null;
			let mapKey = null;
			for (const raw of text.split(/\r?\n/)) {
				const line = stripComment(raw.replace(/\s+$/, ""));
				const t = line.trim();
				if (!t || t.startsWith("#")) continue;
				const indented = line.length > 0 && /^\s/.test(line);
				if (/^-\s*id:/.test(t)) continue;
				if (/^name:\s*['"]@deepseek-ai\/dsh-mcp-client['"]/.test(t)) continue;
				if (t === "config:") continue;
				if (listKey) {
					if (t.startsWith("- ")) { out[listKey].push(unquote(t.slice(2))); continue; }
					if (!indented) listKey = null;
					else throw new Error("无法解析行: " + t);
				}
				if (mapKey) {
					if (t.startsWith("- ")) {
						const kv = t.slice(2);
						const eq = kv.indexOf("=");
						const col = kv.indexOf(":");
						if (eq >= 0 && (col < 0 || eq < col)) { out[mapKey][kv.slice(0, eq).trim()] = unquote(kv.slice(eq + 1)); continue; }
						if (col >= 0) { out[mapKey][kv.slice(0, col).trim()] = unquote(kv.slice(col + 1)); continue; }
						throw new Error("无法解析行: " + t);
					}
					const mm = /^([A-Za-z0-9._-]+)\s*:\s*(.*)$/.exec(t);
					if (mm && indented) { out[mapKey][mm[1]] = unquote(mm[2].trim()); continue; }
					if (!indented) mapKey = null;
					else throw new Error("无法解析行: " + t);
				}
				listKey = null;
				mapKey = null;
				const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(t);
				if (!m) throw new Error("无法解析行: " + t);
				const key = m[1];
				let val = m[2].trim();
				if (val === "" && (key === "args" || key === "env" || key === "headers")) {
					if (key === "args") { listKey = "args"; out.args = []; }
					else { mapKey = key; out[key] = {}; }
					continue;
				}
				if (val === "") { out[key] = true; continue; }
				if (key === "args" && val.startsWith("[")) {
					try { out.args = JSON.parse(val); } catch (e) { out.args = [val]; }
					continue;
				}
				if (key === "env" || key === "headers") {
					if (val.startsWith("{")) {
						try { out[key] = JSON.parse(val); } catch (e) { out[key] = parseKV(val.replace(/[{}]/g, "")); }
					} else {
						out[key] = parseKV(val);
					}
					continue;
				}
				out[key] = scalar(val);
			}
			return normalizeServer(out);
		}
		function normalizeServer(o) {
			const s = { ...o };
			s.serverName = String(s.serverName || "").trim();
			if (!s.transport && s.type) {
				let tt = String(s.type);
				if (tt === "sse" || tt === "http") tt = "streamable-http";
				s.transport = tt === "stdio" ? "stdio" : "streamable-http";
				delete s.type;
			}
			if (!s.transport && s.command) s.transport = "stdio";
			if (!s.serverName) s.serverName = "";
			if (Array.isArray(s.args)) s.args = s.args.map(String).filter(Boolean);
			else if (typeof s.args === "string") s.args = s.args.split(/[\n,]/).map(x => x.trim()).filter(Boolean);
			if (s.env && typeof s.env === "string") s.env = parseKV(s.env);
			if (s.headers && typeof s.headers === "string") s.headers = parseKV(s.headers);
			if (s.reconnect && typeof s.reconnect === "string") {
				try { s.reconnect = JSON.parse(s.reconnect); } catch (e) { delete s.reconnect; }
			}
			return s;
		}

		// ------------------------------------------------------------- formatting

		function yamlScalar(v) {
			const s = String(v);
			if (/^[A-Za-z0-9_\-./~@+]+$/.test(s)) return s;
			return JSON.stringify(s);
		}
		function yamlKey(k) {
			if (/^[A-Za-z0-9._-]+$/.test(k)) return k;
			return JSON.stringify(k);
		}
		function renderServerYaml(s) {
			const lines = [];
			lines.push("serverName: " + yamlScalar(s.serverName || ""));
			lines.push("transport: " + (s.transport || ""));
			if (s.transport === "stdio") {
				lines.push("command: " + yamlScalar(s.command || ""));
				if (Array.isArray(s.args) && s.args.length) {
					lines.push("args:");
					for (const a of s.args) lines.push("  - " + yamlScalar(a));
				}
				if (s.cwd) lines.push("cwd: " + yamlScalar(s.cwd));
				if (s.env && Object.keys(s.env).length) {
					lines.push("env:");
					for (const k of Object.keys(s.env)) lines.push("  " + yamlKey(k) + ": " + yamlScalar(s.env[k]));
				}
			} else {
				if (s.url) lines.push("url: " + yamlScalar(s.url));
				if (s.headers && Object.keys(s.headers).length) {
					lines.push("headers:");
					for (const k of Object.keys(s.headers)) lines.push("  " + yamlKey(k) + ": " + yamlScalar(s.headers[k]));
				}
			}
			if (s.toolCallTimeoutMs) lines.push("toolCallTimeoutMs: " + s.toolCallTimeoutMs);
			if (typeof s.failOnStartupError === "boolean") lines.push("failOnStartupError: " + s.failOnStartupError);
			return lines.join("\n");
		}
		function formatServerText(text) {
			const t = String(text || "").trim();
			if (!t) return { error: "内容为空" };
			try {
				const j = JSON.parse(t);
				if (j && typeof j === "object" && !Array.isArray(j)) return { formatted: JSON.stringify(j, null, 2) };
			} catch (e) { /* fall through */ }
			try {
				const s = parseYamlish(t);
				return { formatted: renderServerYaml(s) };
			} catch (e) {
				return { error: "无法格式化：" + String((e && e.message) || e) };
			}
		}

		const YAML_TEMPLATE = 'serverName: github\ntransport: stdio\ncommand: npx\nargs:\n  - -y\n  - "@modelcontextprotocol/server-github"\nenv:\n  GITHUB_TOKEN: xxxxx\ntoolCallTimeoutMs: 60000\n';
		const ROW_TEMPLATE = "- id: mcp-github\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: github\n    transport: stdio\n    command: npx\n    args: [\"-y\", \"@modelcontextprotocol/server-github\"]\n";
		const CLAUDE_TEMPLATE = '{\n  "github": {\n    "type": "stdio",\n    "command": "npx",\n    "args": [\n      "-y",\n      "@modelcontextprotocol/server-github"\n    ],\n    "env": {\n      "GITHUB_TOKEN": "xxxxx"\n    }\n  }\n}\n';

		// ------------------------------------------------------------- components

		function Page() {
			const [tab, setTab] = React.useState("skills");
			return React.createElement("div", { className: "smc-page" },
				React.createElement("div", { className: "smc-tabs" },
					React.createElement("div", { className: "smc-tab" + (tab === "skills" ? " on" : ""), onClick: () => setTab("skills") }, "技能"),
					React.createElement("div", { className: "smc-tab" + (tab === "mcp" ? " on" : ""), onClick: () => setTab("mcp") }, "MCP"),
				),
				tab === "skills" ? React.createElement(SkillsTab) : React.createElement(McpTab),
			);
		}

		function SkillsTab() {
			const [state, setState] = React.useState({ loading: true, skills: [], error: null, busy: {}, toast: null, filter: "", expanded: null });
			const showToast = (text, isErr) => {
				setState(s => ({ ...s, toast: { text, err: !!isErr } }));
				timer.timeout(() => setState(s => ({ ...s, toast: null })), 3200);
			};
			const load = (silent) => {
				if (!silent) setState(s => ({ ...s, loading: true, error: null }));
				apiCall("skills/list", {}).then(r => {
					if (r && r.ok) setState(s => ({ ...s, loading: false, skills: r.skills || [], error: null }));
					else setState(s => ({ ...s, loading: false, error: (r && r.error) || "加载失败" }));
				}).catch(e => setState(s => ({ ...s, loading: false, error: String((e && e.message) || e) })));
			};
			React.useEffect(() => { load(false); }, []);
			const toggle = (name, enabled) => {
				setState(s => ({ ...s, busy: { ...s.busy, [name]: true } }));
				apiCall("skills/set-enabled", { name, enabled }).then(r => {
					if (r && r.ok) {
						setState(s => ({
							...s,
							busy: { ...s.busy, [name]: false },
							skills: s.skills.map(x => x.name === name ? { ...x, modelInvocable: enabled, userInvocable: enabled } : x),
						}));
						timer.timeout(() => load(true), 1200);
					} else {
						setState(s => ({ ...s, busy: { ...s.busy, [name]: false } }));
						showToast((r && r.error) || "操作失败", true);
					}
				}).catch(e => { setState(s => ({ ...s, busy: { ...s.busy, [name]: false } })); showToast(String((e && e.message) || e), true); });
			};
			const f = (state.filter || "").toLowerCase();
			const rows = state.skills.filter(s => !f || s.name.toLowerCase().indexOf(f) >= 0 || (s.description || "").toLowerCase().indexOf(f) >= 0);
			return React.createElement("div", null,
				React.createElement("div", { className: "smc-topbar" },
					React.createElement("input", { className: "smc-input smc-search", placeholder: "搜索技能…", value: state.filter, onChange: (e) => setState(s => ({ ...s, filter: e.target.value })) }),
					React.createElement("button", { className: "smc-btn", onClick: () => load(false), disabled: state.loading }, "刷新"),
				),
				state.error ? React.createElement("div", { className: "smc-error" }, state.error) : null,
				React.createElement("div", { className: "smc-note" }, "共 " + state.skills.length + " 个，模型可见 " + state.skills.filter(s => s.modelInvocable).length + " 个。点击行查看详情。"),
				rows.map(s => React.createElement("div", { key: s.name, className: "smc-card" + (state.expanded === s.name ? "" : " smc-click"), onClick: () => setState(prev => ({ ...prev, expanded: prev.expanded === s.name ? null : s.name })) },
					React.createElement("div", { className: "smc-row" },
						React.createElement("span", { className: "smc-name" }, s.name),
						React.createElement("span", { className: "smc-tag " + (s.modelInvocable ? "ok" : "bad") }, s.modelInvocable ? "可用" : "已禁用"),
						s.manageable ? null : React.createElement("span", { className: "smc-tag warn" }, "只读"),
						React.createElement("span", { className: "smc-spacer" }),
						s.manageable
							? React.createElement("button", { className: "smc-btn" + (s.modelInvocable ? "" : " primary"), disabled: !!state.busy[s.name], onClick: (e) => { e.stopPropagation(); toggle(s.name, !s.modelInvocable); } }, state.busy[s.name] ? "处理中…" : (s.modelInvocable ? "禁用" : "启用"))
							: null,
					),
					state.expanded === s.name
						? React.createElement("div", { className: "smc-detail" },
							s.description ? React.createElement("div", { className: "smc-desc" }, s.description) : null,
							s.path ? React.createElement("div", { className: "smc-mono", title: s.path }, s.path) : null,
						)
						: null,
				)),
				(!state.loading && rows.length === 0) ? React.createElement("div", { className: "smc-note" }, "没有匹配的技能") : null,
				state.toast ? React.createElement("div", { className: "smc-toast" + (state.toast.err ? " err" : "") }, state.toast.text) : null,
			);
		}

		function ServerForm(props) {
			const init = props.initial || {};
			const cfg = init.config || {};
			const [form, setForm] = React.useState({
				serverName: init.serverName || "",
				transport: init.transport || "stdio",
				command: cfg.command || "",
				argsText: (cfg.args || []).join("\n"),
				envText: toKV(cfg.env),
				cwd: cfg.cwd || "",
				url: cfg.url || "",
				headersText: toKV(cfg.headers),
				toolCallTimeoutMs: cfg.toolCallTimeoutMs || "",
				failOnStartupError: !!cfg.failOnStartupError,
				reconnectEnabled: (cfg.reconnect && typeof cfg.reconnect.enabled === "boolean") ? cfg.reconnect.enabled : true,
				reconnectInitialDelayMs: (cfg.reconnect && cfg.reconnect.initialDelayMs) || "",
				reconnectMaxDelayMs: (cfg.reconnect && cfg.reconnect.maxDelayMs) || "",
				reconnectMaxAttempts: (cfg.reconnect && cfg.reconnect.maxAttempts) || "",
			});
			const [busy, setBusy] = React.useState(false);
			const [err, setErr] = React.useState(null);
			const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
			const save = () => {
				setBusy(true);
				setErr(null);
				const server = {
					id: init.id,
					serverName: form.serverName.trim(),
					transport: form.transport,
					command: form.command.trim(),
					args: form.argsText.split(/\n/).map(x => x.trim()).filter(Boolean),
					env: parseKV(form.envText),
					cwd: form.cwd.trim(),
					url: form.url.trim(),
					headers: parseKV(form.headersText),
					toolCallTimeoutMs: form.toolCallTimeoutMs,
					failOnStartupError: form.failOnStartupError,
					reconnect: {
						enabled: form.reconnectEnabled,
						initialDelayMs: form.reconnectInitialDelayMs,
						maxDelayMs: form.reconnectMaxDelayMs,
						maxAttempts: form.reconnectMaxAttempts,
					},
				};
				apiCall("mcp/save", { server }).then(r => {
					setBusy(false);
					if (r && r.ok) props.onSaved(r);
					else setErr((r && r.error) || "保存失败");
				}).catch(e => { setBusy(false); setErr(String((e && e.message) || e)); });
			};
			const field = (label, child) => React.createElement("div", { className: "smc-field" },
				React.createElement("label", { className: "smc-label" }, label), child);
			return React.createElement("div", null,
				props.initial ? React.createElement("div", { className: "smc-headrow" },
					React.createElement("span", { className: "smc-name" }, "编辑 " + props.initial.id),
					React.createElement("span", { className: "smc-spacer" }),
					React.createElement("button", { className: "smc-btn", onClick: props.onCancel }, "返回"),
				) : null,
				field("名称",
					React.createElement("input", { className: "smc-input", value: form.serverName, onChange: (e) => set("serverName", e.target.value), placeholder: "如 github" })),
				field("传输方式",
					React.createElement("select", { className: "smc-select", value: form.transport, onChange: (e) => set("transport", e.target.value) },
						React.createElement("option", { value: "stdio" }, "stdio（本地子进程）"),
						React.createElement("option", { value: "streamable-http" }, "streamable-http（远程 HTTP）"),
					)),
				form.transport === "stdio"
					? React.createElement("div", null,
						field("启动命令", React.createElement("input", { className: "smc-input", value: form.command, onChange: (e) => set("command", e.target.value), placeholder: "如 npx" })),
						field("参数（每行一个）", React.createElement("textarea", { className: "smc-textarea", value: form.argsText, onChange: (e) => set("argsText", e.target.value), placeholder: "-y\n@modelcontextprotocol/server-github" })),
						field("环境变量（每行 KEY=VALUE）", React.createElement("textarea", { className: "smc-textarea", value: form.envText, onChange: (e) => set("envText", e.target.value), placeholder: "GITHUB_TOKEN=xxx" })),
						field("工作目录（可选）", React.createElement("input", { className: "smc-input", value: form.cwd, onChange: (e) => set("cwd", e.target.value) })),
					)
					: React.createElement("div", null,
						field("服务器地址", React.createElement("input", { className: "smc-input", value: form.url, onChange: (e) => set("url", e.target.value), placeholder: "https://host:port/mcp" })),
						field("请求头（每行 KEY=VALUE）", React.createElement("textarea", { className: "smc-textarea", value: form.headersText, onChange: (e) => set("headersText", e.target.value), placeholder: "Authorization=Bearer xxx" })),
					),
				field("调用超时（毫秒，可选）", React.createElement("input", { className: "smc-input", value: form.toolCallTimeoutMs, onChange: (e) => set("toolCallTimeoutMs", e.target.value), placeholder: "60000" })),
				field("启动失败即报错",
					React.createElement("label", { className: "smc-label", style: { display: "flex", alignItems: "center", gap: 6, marginTop: 2 } },
						React.createElement("input", { type: "checkbox", checked: form.failOnStartupError, onChange: (e) => set("failOnStartupError", e.target.checked) }), "连接或同步失败时拒绝激活"),
				),
				field("自动重连",
					React.createElement("label", { className: "smc-label", style: { display: "flex", alignItems: "center", gap: 6, marginTop: 2 } },
						React.createElement("input", { type: "checkbox", checked: form.reconnectEnabled, onChange: (e) => set("reconnectEnabled", e.target.checked) }), "断线后自动重连"),
				),
				form.reconnectEnabled
					? React.createElement("div", null,
						field("重连初始延迟（毫秒）", React.createElement("input", { className: "smc-input", value: form.reconnectInitialDelayMs, onChange: (e) => set("reconnectInitialDelayMs", e.target.value), placeholder: "500" })),
						field("退避上限（毫秒）", React.createElement("input", { className: "smc-input", value: form.reconnectMaxDelayMs, onChange: (e) => set("reconnectMaxDelayMs", e.target.value), placeholder: "30000" })),
						field("最大尝试次数", React.createElement("input", { className: "smc-input", value: form.reconnectMaxAttempts, onChange: (e) => set("reconnectMaxAttempts", e.target.value), placeholder: "10" })),
					)
					: null,
				err ? React.createElement("div", { className: "smc-error" }, err) : null,
				React.createElement("div", { className: "smc-actions" },
					React.createElement("button", { className: "smc-btn primary", onClick: save, disabled: busy }, busy ? "保存中…" : "保存"),
					React.createElement("button", { className: "smc-btn", onClick: props.onCancel }, "取消"),
				),
			);
		}

		function McpTab() {
			const [state, setState] = React.useState({ loading: true, managed: [], user: [], error: null, busy: {}, toast: null });
			const [statuses, setStatuses] = React.useState({});
			const [expanded, setExpanded] = React.useState(null);
			const [confirmDel, setConfirmDel] = React.useState(null);
			const [addOpen, setAddOpen] = React.useState(false);
			const [addTab, setAddTab] = React.useState("form");
			const [textForm, setTextForm] = React.useState("");
			const [textErr, setTextErr] = React.useState(null);
			const [parsed, setParsed] = React.useState(null);
			const [editing, setEditing] = React.useState(null);
			const showToast = (text, isErr) => {
				setState(s => ({ ...s, toast: { text, err: !!isErr } }));
				timer.timeout(() => setState(s => ({ ...s, toast: null })), 3200);
			};
			const checkMcp = (id, probe, silent) => {
				if (!silent) setStatuses(s => ({ ...s, [id]: { st: "checking", label: "检测中" } }));
				apiCall("mcp/check", { id, probe: !!probe }).then(r => {
					if (r && r.ok) {
						const p = r.probe;
						let st = null;
						let label = "";
						const detailLines = [];
						if (!r.enabled) { st = "off"; label = "已禁用"; }
						else if (r.registered === true) { st = "ok"; label = "已连接"; }
						else if (p && p.ok === true) { st = "ok"; label = "进程正常"; }
						else { st = "bad"; label = "未连接"; }
						detailLines.push("工具注册：" + (r.registered === true ? "是（mcp__" + r.serverName + "__*）" : (r.registered === false ? "否" : "未知")));
						if (p) {
							if (p.ok === true) detailLines.push("探测：" + (p.note || "通过"));
							else if (p.ok === false) detailLines.push("探测：" + (p.reason || "失败") + (p.detail ? " — " + p.detail : ""));
							else if (p.reason) detailLines.push("探测：" + p.reason);
						}
						setStatuses(s => ({ ...s, [id]: { st, label, detail: detailLines.join("\n") } }));
					} else {
						setStatuses(s => ({ ...s, [id]: { st: "bad", label: "检测失败", detail: (r && r.error) || "检测失败" } }));
					}
				}).catch(e => setStatuses(s => ({ ...s, [id]: { st: "bad", label: "检测失败", detail: String((e && e.message) || e) } })));
			};
			const load = (silent) => {
				if (!silent) setState(s => ({ ...s, loading: true, error: null }));
				apiCall("mcp/list", {}).then(r => {
					if (r && r.ok) {
						setState(s => ({ ...s, loading: false, managed: r.managed || [], user: r.user || [], error: null }));
						for (const srv of (r.managed || [])) {
							if (srv.enabled !== false) checkMcp(srv.id, false, true);
						}
					} else setState(s => ({ ...s, loading: false, error: (r && r.error) || "加载失败" }));
				}).catch(e => setState(s => ({ ...s, loading: false, error: String((e && e.message) || e) })));
			};
			React.useEffect(() => { load(false); }, []);
			const closeAdd = () => { setAddOpen(false); setTextForm(""); setTextErr(null); setParsed(null); };
			const act = (fn, done) => {
				fn().then(r => {
					if (r && r.ok) {
						setState(s => ({ ...s, busy: {} }));
						showToast(done);
						timer.timeout(() => load(true), 700);
					} else {
						setState(s => ({ ...s, busy: {} }));
						showToast((r && r.error) || "操作失败", true);
					}
				}).catch(e => { setState(s => ({ ...s, busy: {} })); showToast(String((e && e.message) || e), true); });
			};
			const toggleMcp = (id, enabled) => {
				setState(s => ({ ...s, busy: { ...s.busy, [id]: true } }));
				apiCall("mcp/set-enabled", { id, enabled }).then(r => {
					if (r && r.ok) {
						setState(s => ({
							...s,
							busy: { ...s.busy, [id]: false },
							managed: s.managed.map(x => x.id === id ? { ...x, enabled } : x),
							user: s.user.map(x => x.id === id ? { ...x, disabled: !enabled } : x),
						}));
						if (enabled) { setStatuses(st => ({ ...st, [id]: { st: "checking", label: "检测中" } })); timer.timeout(() => checkMcp(id, true), 900); }
						else setStatuses(st => { const n = { ...st }; delete n[id]; return n; });
						timer.timeout(() => load(true), 700);
					} else {
						setState(s => ({ ...s, busy: { ...s.busy, [id]: false } }));
						showToast((r && r.error) || "操作失败", true);
					}
				}).catch(e => { setState(s => ({ ...s, busy: { ...s.busy, [id]: false } })); showToast(String((e && e.message) || e), true); });
			};
			const removeMcp = (id) => act(() => apiCall("mcp/remove", { id }), "已删除 " + id);
			const saved = (r) => {
				showToast("已保存 " + (r && r.id ? r.id : ""));
				if (r && r.id) checkMcp(r.id, true);
				timer.timeout(() => load(true), 700);
			};
			const doParse = () => {
				const p = parseServerText(textForm);
				if (p.error) { setTextErr(p.error); return; }
				setTextErr(null);
				const servers = p.servers || [];
				if (servers.length === 0) { setTextErr("未解析到任何服务器"); return; }
				const missing = servers.findIndex(s => !String(s.serverName || "").trim());
				if (missing >= 0) {
					setTextErr("缺少名称：配置中没有服务器名，无法解析。请使用 {\"名称\": {…}} 形式（如 \"c7\": {\"type\": \"streamable-http\", \"url\": \"…\"}），或在配置中提供 serverName 字段。");
					return;
				}
				setParsed(servers.map(s => ({ ...s })));
			};
			const doFormat = () => {
				const r = formatServerText(textForm);
				if (r.error) { setTextErr(r.error); return; }
				setTextErr(null);
				setTextForm(r.formatted);
			};
			const saveParsed = () => {
				const servers = parsed || [];
				if (!servers.length) return;
				const saveAll = (idx, ids) => {
					if (idx >= servers.length) {
						closeAdd();
						showToast("已添加 " + ids.length + " 台服务器");
						for (const id of ids) timer.timeout(() => checkMcp(id, true), 800 + ids.indexOf(id) * 400);
						timer.timeout(() => load(true), 700);
						return;
					}
					const srv = { ...servers[idx] };
					apiCall("mcp/save", { server: srv }).then(r => {
						if (r && r.ok) saveAll(idx + 1, ids.concat(r.id));
						else setTextErr("第 " + (idx + 1) + " 台「" + (srv.serverName || "") + "」保存失败：" + ((r && r.error) || "未知错误"));
					}).catch(e => setTextErr("第 " + (idx + 1) + " 台保存失败：" + String((e && e.message) || e)));
				};
				saveAll(0, []);
			};
			const addPanel = React.createElement("div", { className: "smc-card" },
				React.createElement("div", { className: "smc-row" },
					React.createElement("span", { className: "smc-name" }, "新增 MCP 服务器"),
					React.createElement("span", { className: "smc-spacer" }),
					React.createElement("button", { className: "smc-tab" + (addTab === "form" ? " on" : ""), onClick: () => setAddTab("form") }, "表单"),
					React.createElement("button", { className: "smc-tab" + (addTab === "text" ? " on" : ""), onClick: () => setAddTab("text") }, "文本"),
					React.createElement("button", { className: "smc-btn", onClick: closeAdd }, "返回"),
				),
				addTab === "form"
					? React.createElement("div", { style: { marginTop: 10 } },
						React.createElement(ServerForm, {
							initial: null,
							onSaved: (r) => { closeAdd(); saved(r); },
							onCancel: closeAdd,
						}),
					)
					: React.createElement("div", null,
						React.createElement("div", { className: "smc-note", style: { marginTop: 10 } }, "支持 YAML 与 JSON 文本（JSON 采用 Claude .mcp.json 键名形式，名称即键）。可先点模板填充，粘贴后可点「格式化」整理缩进："),
						React.createElement("div", { className: "smc-actions" },
							React.createElement("button", { className: "smc-btn", onClick: () => setTextForm(YAML_TEMPLATE) }, "YAML 模板"),
							React.createElement("button", { className: "smc-btn", onClick: () => setTextForm(CLAUDE_TEMPLATE) }, "JSON 模板"),
							React.createElement("button", { className: "smc-btn", onClick: () => setTextForm(ROW_TEMPLATE) }, "配置行格式"),
						),
						React.createElement("textarea", { className: "smc-textarea big", style: { marginTop: 8 }, value: textForm, onChange: (e) => setTextForm(e.target.value), placeholder: "粘贴 YAML 或 JSON 配置…" }),
						textErr ? React.createElement("div", { className: "smc-error" }, textErr) : null,
						React.createElement("div", { className: "smc-actions" },
							React.createElement("button", { className: "smc-btn", onClick: doFormat }, "格式化"),
							React.createElement("button", { className: "smc-btn primary", onClick: doParse }, "解析"),
							React.createElement("button", { className: "smc-btn", onClick: closeAdd }, "取消"),
						),
						parsed ? React.createElement("div", null,
							React.createElement("div", { className: "smc-note" }, "解析到 " + parsed.length + " 台，确认名称后保存："),
							parsed.map((s, i) => React.createElement("div", { key: i, className: "smc-card" },
								React.createElement("div", { className: "smc-field" },
									React.createElement("label", { className: "smc-label" }, "名称"),
									React.createElement("input", { className: "smc-input", value: s.serverName, onChange: (e) => { const next = parsed.slice(); next[i] = { ...next[i], serverName: e.target.value }; setParsed(next); } }),
								),
								React.createElement("div", { className: "smc-mono" }, (s.transport || "") + "  →  " + (s.url || s.command || "")),
							)),
							React.createElement("div", { className: "smc-actions" },
								React.createElement("button", { className: "smc-btn primary", onClick: saveParsed }, "保存全部"),
								React.createElement("button", { className: "smc-btn", onClick: () => setParsed(null) }, "返回修改"),
							),
						) : null,
					),
			);
			const statusTag = (s) => {
				if (s.enabled === false) return React.createElement("span", { className: "smc-tag bad" }, "已禁用");
				const st = statuses[s.id];
				if (!st) return React.createElement("span", { className: "smc-tag ok" }, "已启用");
				if (st.st === "checking") return React.createElement("span", { className: "smc-tag warn" }, "检测中");
				if (st.st === "ok") return React.createElement("span", { className: "smc-tag ok", title: st.detail }, st.label);
				if (st.st === "bad") return React.createElement("span", { className: "smc-tag bad", title: st.detail }, st.label);
				return React.createElement("span", { className: "smc-tag ok" }, "已启用");
			};
			return React.createElement("div", null,
				React.createElement("div", { className: "smc-topbar" },
					React.createElement("span", { className: "smc-title" }, "MCP 服务器"),
					React.createElement("span", { className: "smc-spacer" }),
					React.createElement("button", { className: "smc-btn", onClick: () => load(false), disabled: state.loading }, "刷新"),
					addOpen ? null : React.createElement("button", { className: "smc-btn primary", onClick: () => { setAddOpen(true); setAddTab("form"); } }, "+ 添加"),
				),
				state.error ? React.createElement("div", { className: "smc-error" }, state.error) : null,
				addOpen ? addPanel : null,
				state.managed.map(s => {
					const st = statuses[s.id];
					return React.createElement("div", { key: s.id, className: "smc-card" + (expanded === s.id ? "" : " smc-click"), onClick: () => setExpanded(expanded === s.id ? null : s.id) },
						React.createElement("div", { className: "smc-row" },
							React.createElement("span", { className: "smc-name" }, s.serverName || s.id),
							statusTag(s),
							React.createElement("span", { className: "smc-tag" }, s.transport),
							React.createElement("span", { className: "smc-spacer" }),
							React.createElement("button", { className: "smc-btn" + (s.enabled ? "" : " primary"), disabled: !!state.busy[s.id], onClick: (e) => { e.stopPropagation(); toggleMcp(s.id, !s.enabled); } }, state.busy[s.id] ? "处理中…" : (s.enabled ? "禁用" : "启用")),
						),
						expanded === s.id
							? React.createElement("div", { className: "smc-detail" },
								React.createElement("div", { className: "smc-mono" }, s.id + "  →  " + (s.target || "")),
								st ? React.createElement("div", { className: "smc-desc smc-status-line", style: { marginTop: 4 } }, st.detail || st.label) : null,
								React.createElement("div", { className: "smc-actions" },
									React.createElement("button", { className: "smc-btn", disabled: st && st.st === "checking", onClick: (e) => { e.stopPropagation(); checkMcp(s.id, true); } }, (st && st.st === "checking") ? "检测中…" : "检测"),
									React.createElement("button", { className: "smc-btn", onClick: (e) => { e.stopPropagation(); setEditing(editing === s.id ? null : s.id); } }, editing === s.id ? "收起" : "编辑"),
									React.createElement("button", { className: "smc-btn danger", onClick: (e) => { e.stopPropagation(); setConfirmDel(s); } }, "删除"),
								),
								editing === s.id ? React.createElement("div", { style: { marginTop: 8 } },
									React.createElement(ServerForm, {
										initial: s,
										onSaved: (r) => { setEditing(null); saved(r); },
										onCancel: () => setEditing(null),
									}),
								) : null,
							)
							: null,
					);
				}),
				state.user.map(s => React.createElement("div", { key: "u" + s.id, className: "smc-card" },
					React.createElement("div", { className: "smc-row" },
						React.createElement("span", { className: "smc-name" }, s.id),
						React.createElement("span", { className: "smc-tag " + (s.disabled ? "bad" : "ok") }, s.disabled ? "已禁用" : "已启用"),
						React.createElement("span", { className: "smc-tag warn" }, "手动配置"),
						React.createElement("span", { className: "smc-spacer" }),
						React.createElement("button", { className: "smc-btn" + (s.disabled ? " primary" : ""), disabled: !!state.busy[s.id], onClick: () => toggleMcp(s.id, s.disabled) }, state.busy[s.id] ? "处理中…" : (s.disabled ? "启用" : "禁用")),
					),
				)),
				confirmDel ? React.createElement("div", { className: "smc-modal-backdrop", onClick: () => setConfirmDel(null) },
					React.createElement("div", { className: "smc-modal", onClick: (e) => e.stopPropagation() },
						React.createElement("div", { className: "smc-modal-title" }, "删除 MCP 服务器？"),
						React.createElement("div", { className: "smc-note" }, "将删除「" + (confirmDel.serverName || confirmDel.id) + "」（" + confirmDel.id + "）及其配置。"),
						React.createElement("div", { className: "smc-actions" },
							React.createElement("button", { className: "smc-btn", onClick: () => setConfirmDel(null) }, "取消"),
							React.createElement("button", { className: "smc-btn danger", onClick: () => { const id = confirmDel.id; setConfirmDel(null); removeMcp(id); } }, "确认删除"),
						),
					),
				) : null,
				state.toast ? React.createElement("div", { className: "smc-toast" + (state.toast.err ? " err" : "") }, state.toast.text) : null,
			);
		}

		// ------------------------------------------------------------- plugin

		function apply(ctx) {
			insertCss(CSS);
			timer = ctx.timer;
			const slots = ctx.slots || ctx.get("slots");
			if (!slots) return;
			slots.inject("settings.section", () => slots.register(
				{ name: "settings.section", id: "skill-mcp", order: 25, label: "技能与 MCP" },
				(props) => React.createElement(Page),
			));
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
