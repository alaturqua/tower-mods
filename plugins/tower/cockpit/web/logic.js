var PREFS_KEY = 'tower-cockpit-prefs';
var COLORS = { needs: 'var(--warn)', working: 'var(--work)', done: 'var(--ok)', idle: 'var(--faint)', stuck: 'var(--bad)' };
var TINTS = { needs: 'var(--warn-tint)', working: 'var(--work-tint)', done: 'var(--ok-tint)', idle: 'var(--line-soft)' };
var LABELS = { needs: 'needs you', working: 'working', done: 'done', idle: 'idle' };
var RANK = { needs: 0, working: 1, done: 2, idle: 3 };
var ICONS = { you: '›', tool: '▸', say: '◆', wait: '!', sent: '↗' };
var ICON_COLORS = { you: 'var(--muted)', tool: 'var(--work)', say: 'var(--ok)', wait: 'var(--warn)', sent: 'var(--work)' };
var DIFF_STYLES = { hunk: 'color: var(--muted)', ctx: 'color: var(--text2)', del: 'color: var(--bad); background: var(--bad-tint2)', add: 'color: var(--ok); background: var(--ok-tint2)' };
var SEG = { working: 'var(--work)', needs: 'var(--warn)', stuck: 'var(--bad)', done: 'var(--ok)', idle: 'transparent' };
var MODELS = [['', 'Default model'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
var MODES = [['auto', 'auto'], ['acceptEdits', 'accept edits'], ['plan', 'plan first'], ['default', 'ask for everything']];
// Shown when a session has not published its own list (it started before this plugin
// could): Claude Code's everyday built-ins, typed in full they all still run.
var BUILTIN_COMMANDS = [
  ['compact', 'Compact the conversation to free context'], ['clear', 'Start a fresh conversation'],
  ['cost', 'Show this session\'s cost and usage'], ['context', 'Show what fills the context window'],
  ['model', 'Switch the model, e.g. /model sonnet'], ['status', 'Show version, model and account'],
  ['memory', 'Edit CLAUDE.md memory'], ['review', 'Review a pull request'],
  ['init', 'Write a CLAUDE.md for this repo'], ['permissions', 'Show or change permission rules'],
  ['agents', 'Manage subagents'], ['mcp', 'Manage MCP servers'], ['help', 'List what Claude Code can do']
].map(function (c) { return { name: c[0], description: c[1] }; });
var MENU_MAX = 40;
var BTN_PRIMARY ='min-height: 40px; padding: 0 14px; border-radius: 8px; border: none; background: var(--warn); color: var(--on-warn); font-weight: 600';
var BTN_SECONDARY = 'min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--warn-edge); background: transparent; color: var(--text)';

function dot(state, size) {
  return 'width: ' + size + 'px; height: ' + size + 'px; border-radius: 50%; flex: none; background: ' + (COLORS[state] || COLORS.idle);
}
function pill(state) {
  return 'justify-self: start; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: ' + TINTS[state] + '; color: ' + (state === 'idle' ? 'var(--muted)' : COLORS[state]);
}
function money(n) { return '$' + (Number(n) || 0).toFixed(2); }
function key(path) { return String(path || '').toLowerCase().replace(/[\\/]+$/, ''); }
function sum(list, field) { return list.reduce(function (n, a) { return n + (a[field] || 0); }, 0); }
function worstOf(list) {
  if (list.some(function (a) { return a.state === 'needs'; })) return 'needs';
  if (list.some(function (a) { return a.health; })) return 'stuck';
  if (list.some(function (a) { return a.state === 'working'; })) return 'working';
  if (list.some(function (a) { return a.state === 'done'; })) return 'done';
  return 'idle';
}

class Component extends DCLogic {
  constructor(props) {
    super(props);
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (err) { saved = {}; }
    var systemLight = false;
    try { systemLight = window.matchMedia('(prefers-color-scheme: light)').matches; } catch (err) {}
    this.state = {
      data: { agents: [], repos: [], totals: { total: 0, needs: 0, working: 0, done: 0, alerts: 0, cost: 0 }, error: null },
      conn: 'connecting', repo: 'all', ws: null, selected: null, draft: '', checked: {}, bulkDraft: '', tab: 'activity',
      view: saved.view || 'fleet', theme: saved.theme || 'system', systemLight: systemLight,
      folded: saved.folded || {}, railCollapsed: Boolean(saved.railCollapsed), detailCollapsed: Boolean(saved.detailCollapsed),
      formOpen: false, formRepo: null, formPath: null, formWorktree: true, formName: '', formBase: 'main', formModel: '', formMode: 'auto', formTask: '',
      toast: null, commands: {}, cmdIndex: 0, cmdClosed: false
    };
  }

  componentDidMount() {
    var self = this;
    this.events = new EventSource('/api/events');
    this.events.onmessage = function (e) { self.setState({ data: JSON.parse(e.data), conn: 'live' }); };
    this.events.onerror = function () { self.setState({ conn: 'down' }); };
    try {
      this.mq = window.matchMedia('(prefers-color-scheme: light)');
      this.mq.addEventListener('change', function (e) { self.setState({ systemLight: e.matches }); });
    } catch (err) {}
    document.addEventListener('keydown', function (e) { self.onKey(e); });
  }

  remember(patch) {
    this.setState(patch, function () {
      var st = this.state;
      try { localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: st.theme, view: st.view, folded: st.folded, railCollapsed: st.railCollapsed, detailCollapsed: st.detailCollapsed })); } catch (err) {}
    });
  }

  toast(text, isError) {
    var self = this;
    clearTimeout(this.toastTimer);
    this.setState({ toast: { text: text, isError: Boolean(isError) } });
    this.toastTimer = setTimeout(function () { self.setState({ toast: null }); }, 4000);
  }

  post(action, body) {
    var self = this;
    return fetch('/api/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) { self.toast(res.message || (res.ok ? 'Done.' : 'Failed.'), !res.ok); return res; })
      .catch(function (err) { self.toast('The cockpit server did not answer: ' + err.message, true); return { ok: false }; });
  }

  loadCommands(id) {
    var self = this;
    if (!id || this.state.commands[id]) return;
    fetch('/api/commands?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (list) {
      var commands = Object.assign({}, self.state.commands);
      commands[id] = list;
      self.setState({ commands: commands });
    }).catch(function () {});
  }

  // The slash-command drop-up: open while the draft is "/" plus a command name, before a space.
  commandMenu(sel) {
    var self = this, st = this.state;
    var m = /^\/(\S*)$/.exec(st.draft);
    var known = sel && st.commands[sel.id];
    var list = known && known.length ? known : BUILTIN_COMMANDS;
    var query = m ? m[1].toLowerCase() : '';
    // Claude Code's own commands before plugins' (`plugin:name`), then the closest match.
    var rank = function (c) {
      var name = c.name.toLowerCase();
      return [name.indexOf(':') >= 0 ? 1 : 0, name === query ? 0 : name.indexOf(query) === 0 ? 1 : 2, name.length];
    };
    var hits = list.filter(function (c) { return c.name.toLowerCase().indexOf(query) >= 0; })
      .map(function (c, i) { return { c: c, r: rank(c), i: i }; })
      .sort(function (x, y) { return x.r[0] - y.r[0] || x.r[1] - y.r[1] || (query ? x.r[2] - y.r[2] : x.i - y.i); })
      .map(function (h) { return h.c; })
      .slice(0, MENU_MAX);
    var index = Math.min(st.cmdIndex, Math.max(0, hits.length - 1));
    var open = Boolean(m) && !st.cmdClosed && Boolean(sel);
    var choose = function (c) {
      self.setState({ draft: '/' + c.name + ' ', cmdIndex: 0, cmdClosed: true }, function () {
        var input = document.getElementById('say');
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      });
    };
    return {
      open: open, expanded: String(open), empty: open && hits.length === 0, query: '/' + query,
      hasNote: open && !(known && known.length),
      note: 'This session started before Tower could list its commands, so these are the common built-ins. Restart it to see all of its commands, plugins and skills included.',
      items: hits.map(function (c, i) {
        return {
          name: '/' + c.name, description: c.description, on: String(i === index),
          style: 'display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: baseline; width: 100%; min-height: 36px; padding: 6px 10px; border: none; border-radius: 7px; text-align: left; color: var(--text); background: ' + (i === index ? 'var(--sel)' : 'transparent'),
          pick: function () { choose(c); }
        };
      }),
      key: function (e) {
        if (!open) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var step = e.key === 'ArrowDown' ? 1 : -1;
          self.setState({ cmdIndex: (index + step + hits.length) % Math.max(1, hits.length) }, function () {
            var on = document.querySelector('#say-commands [aria-selected="true"]');
            if (on) on.scrollIntoView({ block: 'nearest' });
          });
        } else if ((e.key === 'Enter' || e.key === 'Tab') && hits.length) {
          e.preventDefault();
          choose(hits[index]);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          self.setState({ cmdClosed: true });
        }
      }
    };
  }

  agents() {
    return (this.state.data.agents || []).slice().sort(function (x, y) { return RANK[x.state] - RANK[y.state] || (y.waited || 0) - (x.waited || 0); });
  }

  // The one picked, else the first that can be steered from here, else the first.
  selectedAgent(list) {
    var st = this.state;
    return list.filter(function (a) { return a.id === st.selected; })[0]
      || list.filter(function (a) { return a.canSteer; })[0] || list[0] || null;
  }

  openForm(root, path, worktree) {
    var repo = (this.state.data.repos || []).filter(function (r) { return key(r.root) === key(root); })[0];
    var main = repo && repo.worktrees.filter(function (w) { return key(w.path) === key(repo.root); })[0];
    this.setState({ formOpen: true, formRepo: root, formPath: path, formWorktree: worktree, formName: '', formTask: '', formBase: 'current' });
  }

  launch() {
    var st = this.state, self = this;
    if (st.formWorktree && !st.formName.trim()) { this.toast('Name the workstream first.', true); return; }
    this.post('launch', { repo: st.formWorktree ? st.formRepo : (st.formPath || st.formRepo), name: st.formName, base: st.formBase, task: st.formTask, model: st.formModel, mode: st.formMode, worktree: st.formWorktree })
      .then(function (res) {
        if (!res.ok) return;
        var branch = st.formName.trim().replace(/\s+/g, '-');
        self.setState({ formOpen: false, repo: st.formRepo, ws: st.formWorktree ? branch : self.state.ws, selected: res.id || self.state.selected });
      });
  }

  actionsFor(a) {
    var self = this, p = a.pending;
    if (!p) return [];
    if (p.kind === 'local') return [{ label: 'Jump to it', style: BTN_PRIMARY, run: function () { self.post('jump', { id: a.id, kind: a.kind, pid: a.pid, path: a.path }); } }];
    if (p.kind === 'question') {
      return (p.options || []).slice(0, 4).map(function (opt, i) {
        return { label: opt + '  ' + (i + 1), style: i === 0 ? BTN_PRIMARY : BTN_SECONDARY, run: function () { self.post('answer', { id: a.id, pendingId: p.id, text: opt }); } };
      });
    }
    return [
      { label: 'Allow  A', style: BTN_PRIMARY, run: function () { self.post('answer', { id: a.id, pendingId: p.id, allow: true }); } },
      { label: 'Deny  D', style: BTN_SECONDARY, run: function () { self.post('answer', { id: a.id, pendingId: p.id, allow: false }); } }
    ];
  }

  // J/K walk the waiting agents, A/D allow or deny, 1-4 answer, X selects, T toggles the timeline.
  onKey(e) {
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    var list = this.agents();
    var needs = list.filter(function (a) { return a.state === 'needs'; });
    var sel = this.selectedAgent(list);
    var k = e.key.toLowerCase();
    if ((k === 'j' || k === 'k') && needs.length) {
      var at = Math.max(0, needs.indexOf(sel));
      var next = needs[(at + (k === 'j' ? 1 : needs.length - 1)) % needs.length];
      this.setState({ selected: next.id });
      this.loadCommands(next.id);
    } else if (sel && sel.pending && (k === 'a' || k === 'd') && sel.pending.kind !== 'question' && sel.pending.kind !== 'local') {
      this.post('answer', { id: sel.id, pendingId: sel.pending.id, allow: k === 'a' });
    } else if (sel && sel.pending && sel.pending.kind === 'question' && /^[1-4]$/.test(k)) {
      var opt = (sel.pending.options || [])[Number(k) - 1];
      if (opt) this.post('answer', { id: sel.id, pendingId: sel.pending.id, text: opt });
    } else if (sel && k === 'x') {
      var c = Object.assign({}, this.state.checked);
      if (c[sel.id]) delete c[sel.id]; else c[sel.id] = true;
      this.setState({ checked: c });
    } else if (k === 't') {
      this.remember({ view: this.state.view === 'timeline' ? 'fleet' : 'timeline' });
    } else {
      return;
    }
    e.preventDefault();
  }

  renderVals() {
    var self = this, st = this.state, data = st.data;
    var live = this.agents();
    var repoList = data.repos || [];
    var inRepo = function (root) { return live.filter(function (a) { return key(a.repoRoot) === key(root); }); };

    var repos = [{ root: 'all', name: 'All repositories', worktrees: [] }].concat(repoList).map(function (r) {
      var isAll = r.root === 'all';
      var mine = isAll ? live : inRepo(r.root);
      var isFolded = Boolean(st.folded[r.root]);
      var waitingHere = mine.filter(function (a) { return a.state === 'needs'; }).length;
      var active = st.repo === r.root && !st.ws;
      return {
        name: r.name, count: String(mine.length), isAll: isAll,
        expanded: String(!isFolded), chevron: isFolded ? '▸' : '▾',
        foldLabel: (isFolded ? 'Show' : 'Hide') + ' workstreams of ' + r.name,
        fold: function () { var f = Object.assign({}, self.state.folded); if (f[r.root]) delete f[r.root]; else f[r.root] = true; self.remember({ folded: f }); },
        showWs: !isAll, showList: !isAll && !isFolded,
        summary: isAll ? String(mine.length) : (isFolded ? r.worktrees.length + ' ws' + (waitingHere ? ' · ' + waitingHere + '!' : '') : String(mine.length)),
        initials: isAll ? 'ALL' : r.name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map(function (w) { return w.charAt(0); }).join('').slice(0, 3).toUpperCase(),
        miniStyle: 'width: 48px; min-height: 44px; border-radius: 8px; border: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: ' + (st.repo === r.root ? 'var(--sel)' : 'transparent'),
        dot: dot(worstOf(mine), 8),
        style: 'flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 10px; border-radius: 8px; border: none; color: var(--text); background: ' + (active ? 'var(--sel)' : 'transparent') + '; font-weight: ' + (st.repo === r.root ? '600' : '400'),
        pick: function () { self.setState({ repo: r.root, ws: null }); },
        newWs: function () { self.openForm(r.root, null, true); },
        ws: r.worktrees.map(function (w) {
          var inWs = mine.filter(function (a) { return a.branch === w.branch; });
          var on = st.repo === r.root && st.ws === w.branch;
          return {
            name: w.branch, count: String(inWs.length), add: String(sum(inWs, 'add')), del: String(sum(inWs, 'del')),
            prShort: w.pr ? '· #' + w.pr.num : '',
            dot: dot(inWs.length ? worstOf(inWs) : 'idle', 7),
            style: 'display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 2px 8px; border-radius: 6px; border: none; color: var(--text); background: ' + (on ? 'var(--sel)' : 'transparent') + '; box-shadow: ' + (on ? 'inset 2px 0 0 var(--work)' : 'none'),
            pick: function () { self.setState({ repo: r.root, ws: w.branch }); }
          };
        })
      };
    });

    var scoped = live.filter(function (a) { return (st.repo === 'all' || key(a.repoRoot) === key(st.repo)) && (!st.ws || a.branch === st.ws); });
    var sel = this.selectedAgent(scoped.length ? scoped : live);
    if (sel) this.loadCommands(sel.id);

    var agents = scoped.map(function (a) {
      var chosen = sel && a.id === sel.id;
      var pr = a.pr ? ('#' + a.pr.num + (a.pr.checks.some(function (c) { return c[1] === 'fail'; }) ? ' · CI ✗' : a.pr.checks.length ? ' · CI ✓' : '') + (a.pr.mergeable ? ' · ready' : '')) : '—';
      return {
        repo: a.repo, name: a.name, kindTag: a.kind, stateLabel: LABELS[a.state], doing: a.doing, ctx: a.ctx + '%', cost: money(a.cost),
        add: String(a.add), del: String(a.del), files: String(a.files), pr: pr,
        prStyle: "font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: " + (!a.pr ? 'var(--faint)' : (pr.indexOf('✗') >= 0 ? 'var(--bad)' : 'var(--ok)')),
        hasHealth: Boolean(a.health), health: a.health || '',
        dot: dot(a.health ? 'stuck' : a.state, 10), pill: pill(a.state),
        ctxBar: 'display: block; height: 100%; width: ' + a.ctx + '%; background: ' + (a.ctx >= 80 ? 'var(--bad)' : 'var(--bar)'),
        rowStyle: 'display: grid; grid-template-columns: 40px 1fr; align-items: center; border-bottom: 1px solid var(--line-soft); background: ' + (chosen ? 'var(--row-sel)' : 'transparent') + '; box-shadow: ' + (chosen ? 'inset 3px 0 0 var(--work)' : 'none'),
        cardStyle: 'display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 12px; background: ' + (chosen ? 'var(--row-sel)' : 'var(--panel)') + '; border: 1px solid ' + (chosen ? 'var(--info-edge)' : 'var(--line)') + '; border-top: 3px solid ' + COLORS[a.health ? 'stuck' : a.state],
        checked: Boolean(st.checked[a.id]),
        toggle: function () { var c = Object.assign({}, self.state.checked); if (c[a.id]) delete c[a.id]; else c[a.id] = true; self.setState({ checked: c }); },
        pick: function () { self.setState({ selected: a.id, draft: '' }); }
      };
    });

    var needs = scoped.filter(function (a) { return a.state === 'needs' && a.pending; }).map(function (a) {
      var p = a.pending, old = a.waited >= 5;
      return {
        repo: a.repo, name: a.name, waited: a.waited + 'm', detail: p.detail, why: p.why || '', hasWhy: Boolean(p.why),
        waitStyle: "font-size: 12px; font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: " + (old ? 'var(--bad)' : 'var(--warn)'),
        cardStyle: 'background: var(--warn-bg); border: 1px solid ' + (old ? 'var(--bad-edge2)' : 'var(--warn-edge)') + '; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px',
        kindLabel: p.kind === 'question' ? 'Asks you' : p.kind === 'edit' ? 'Wants to edit' : p.kind === 'local' ? 'Waiting in its terminal' : 'Wants to run',
        hasRisk: Boolean(p.risk), risk: p.risk || '',
        hasDiff: Boolean(p.diff && p.diff.length), diff: (p.diff || []).map(function (d) { return { text: d[0], style: 'padding: 1px 10px; white-space: pre; ' + DIFF_STYLES[d[1]] }; }),
        actions: self.actionsFor(a),
        open: function () { self.setState({ selected: a.id }); }
      };
    });

    var waitedMinutes = 0;
    var lanes = scoped.map(function (a) {
      (a.lane || []).forEach(function (s) { if (s[2] === 'needs') waitedMinutes += s[1] - s[0]; });
      return {
        repo: a.repo, name: a.name,
        segs: (a.lane || []).filter(function (s) { return s[2] !== 'idle'; }).map(function (s) {
          return { title: s[2] + ' ' + Math.round(60 - s[0]) + '–' + Math.round(60 - s[1]) + ' min ago',
            style: 'position: absolute; top: 3px; bottom: 3px; border-radius: 3px; left: ' + (s[0] / 60 * 100) + '%; width: ' + ((s[1] - s[0]) / 60 * 100) + '%; background: ' + SEG[s[2]] };
        })
      };
    });

    var checkedIds = Object.keys(st.checked).filter(function (id) { return live.some(function (a) { return a.id === id; }); });
    var tabDefs = [['activity', 'Activity'], ['changes', 'Changes'], ['pr', 'Pull request']];
    var viewBtn = function (on) { return 'min-height: 34px; padding: 0 14px; border-radius: 7px; border: none; font-weight: 600; background: ' + (on ? 'var(--seg-on)' : 'transparent') + '; color: ' + (on ? 'var(--text)' : 'var(--muted)'); };
    var themeAttr = st.theme === 'system' ? (st.systemLight ? 'light' : 'dark') : st.theme;
    var segBtn = function (on) { return 'min-height: 34px; padding: 0 12px; border-radius: 7px; border: none; font-size: 13px; font-weight: 600; background: ' + (on ? 'var(--seg-on)' : 'transparent') + '; color: ' + (on ? 'var(--text)' : 'var(--muted)') + '; box-shadow: ' + (on ? '0 0 0 1px var(--line)' : 'none'); };
    var allFolded = repoList.length > 0 && repoList.every(function (r) { return st.folded[r.root]; });

    var formRepo = repoList.filter(function (r) { return key(r.root) === key(st.formRepo); })[0];
    var formRepoName = formRepo ? formRepo.name : String(st.formRepo || '').split(/[\\/]/).pop();
    var slug = st.formName.trim().replace(/\s+/g, '-');
    var wsRepo = repoList.filter(function (r) { return key(r.root) === key(st.repo); })[0];
    var wsTree = wsRepo && wsRepo.worktrees.filter(function (w) { return w.branch === st.ws; })[0];
    var wsAgents = st.ws ? scoped : [];
    var wsPr = wsTree && wsTree.pr;
    var p = sel && sel.pending;
    var cmds = (sel && st.commands[sel.id]) || [];

    return {
      theme: {
        attr: themeAttr,
        options: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
          var on = st.theme === o[0];
          return { label: o[1], pressed: String(on), style: segBtn(on), pick: function () { self.remember({ theme: o[0] }); } };
        })
      },
      conn: {
        down: st.conn !== 'live' || Boolean(data.error),
        label: st.conn === 'down' ? 'Server unreachable: is the cockpit still running?' : st.conn === 'connecting' ? 'Connecting…' : 'Session list failed: ' + data.error
      },
      toast: { show: Boolean(st.toast), text: st.toast ? st.toast.text : '', style: 'position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 10; max-width: min(640px, calc(100vw - 32px)); padding: 12px 16px; border-radius: 10px; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,0.25); background: ' + (st.toast && st.toast.isError ? 'var(--bad)' : 'var(--text)') + '; color: var(--bg)' },
      empty: live.length === 0 && st.conn === 'live',
      newAgent: function () {
        var root = st.repo !== 'all' ? st.repo : (repoList[0] && repoList[0].root);
        if (!root) { self.toast('Add a repository first, with + Add repository.', true); return; }
        self.openForm(root, null, true);
      },
      addRepo: function () {
        var path = window.prompt('Path to a git repository on this machine:');
        if (path) self.post('add-repo', { path: path });
      },
      detail: {
        isCollapsed: Boolean(sel) && st.detailCollapsed, isOpen: Boolean(sel) && !st.detailCollapsed,
        toggle: function () { self.remember({ detailCollapsed: !self.state.detailCollapsed }); }
      },
      rail: {
        isCollapsed: st.railCollapsed, isOpen: !st.railCollapsed,
        toggle: function () { self.remember({ railCollapsed: !self.state.railCollapsed }); },
        foldLabel: allFolded ? 'Expand all' : 'Collapse all',
        foldAll: function () {
          var f = {};
          if (!allFolded) repoList.forEach(function (r) { f[r.root] = true; });
          self.remember({ folded: f });
        }
      },
      form: {
        open: st.formOpen,
        title: (st.formWorktree ? 'New workstream in ' : 'New agent in ') + formRepoName + (st.formPath && !st.formWorktree ? ' ⎇ ' + (st.ws || '') : ''),
        blurb: st.formWorktree ? 'Creates a git worktree on its own branch, so its agents never collide with other work in this repo, then starts an agent in it.' : 'Starts a background agent in ' + (st.formPath || st.formRepo) + '.',
        name: st.formName, task: st.formTask, worktree: st.formWorktree,
        base: st.formBase, model: st.formModel, mode: st.formMode,
        // Claude Code's worktrees start from the repo's current branch.
        bases: [{ value: 'current', label: 'the current branch' }],
        models: MODELS.map(function (m) { return { value: m[0], label: m[1], selected: m[0] === st.formModel }; }),
        modes: MODES.map(function (m) { return { value: m[0], label: m[1], selected: m[0] === st.formMode }; }),
        submitLabel: st.formWorktree ? 'Create workstream' : 'Start agent',
        preview: st.formWorktree
          ? (slug ? 'claude --bg -w ' + slug + (st.formModel ? ' --model ' + st.formModel : '') + ' --permission-mode ' + st.formMode + ' -- "' + (st.formTask || '…') + '"' : 'Name the workstream to see the worktree and command it will create.')
          : 'claude --bg' + (st.formModel ? ' --model ' + st.formModel : '') + ' --permission-mode ' + st.formMode + ' -- "' + (st.formTask || '…') + '"',
        typedName: function (e) { self.setState({ formName: e.target.value }); },
        typedTask: function (e) { self.setState({ formTask: e.target.value }); },
        pickBase: function (e) { self.setState({ formBase: e.target.value }); },
        pickModel: function (e) { self.setState({ formModel: e.target.value }); },
        pickMode: function (e) { self.setState({ formMode: e.target.value }); },
        toggleWorktree: function (e) { self.setState({ formWorktree: e.target.checked }); },
        create: function (e) { if (e && e.preventDefault) e.preventDefault(); self.launch(); },
        cancel: function () { self.setState({ formOpen: false }); }
      },
      wsHead: {
        show: Boolean(st.ws && wsTree),
        name: st.ws || '', repo: wsRepo ? wsRepo.name : '',
        base: (wsAgents[0] && wsAgents[0].base) || 'main',
        path: wsTree ? wsTree.path : '',
        dot: dot(wsAgents.length ? worstOf(wsAgents) : 'idle', 10),
        add: String(sum(wsAgents, 'add')), del: String(sum(wsAgents, 'del')), files: String(sum(wsAgents, 'files')),
        ahead: String((wsAgents[0] && wsAgents[0].ahead) || 0), behind: String((wsAgents[0] && wsAgents[0].behind) || 0),
        agents: wsAgents.length === 1 ? '1 agent' : wsAgents.length + ' agents',
        pr: wsPr ? wsPr.title : 'no PR yet',
        prStyle: 'color: ' + (wsPr ? (wsPr.mergeable ? 'var(--ok)' : 'var(--warn)') : 'var(--muted)'),
        prAction: wsPr ? 'Open PR #' + wsPr.num : 'Ask for a PR',
        addAgent: function () { self.openForm(wsRepo.root, wsTree.path, false); },
        openEditor: function () { self.post('open-editor', { path: wsTree.path }); },
        prDo: function () {
          if (wsPr) { window.open(wsPr.url, '_blank', 'noopener'); return; }
          if (!wsAgents[0]) { self.toast('No agent in this workstream to ask.', true); return; }
          self.post('send', { id: wsAgents[0].id, text: 'Push this branch and open a pull request for it with gh pr create.' });
        },
        remove: function () {
          if (window.confirm('Remove the worktree at ' + wsTree.path + '? Its branch stays.')) {
            self.post('remove-worktree', { root: wsRepo.root, path: wsTree.path }).then(function (res) { if (res.ok) self.setState({ ws: null }); });
          }
        }
      },
      fleet: { total: String(data.totals.total), needs: String(data.totals.needs), working: String(data.totals.working), done: String(data.totals.done), alerts: String(data.totals.alerts), cost: money(data.totals.cost) },
      repos: repos,
      scopeLabel: st.repo === 'all' ? 'all repositories' : ((wsRepo ? wsRepo.name : '') + (st.ws ? ' ⎇ ' + st.ws : ' · all workstreams')),
      agents: agents, lanes: lanes, needs: needs, hasNeeds: needs.length > 0,
      waitedTotal: Math.round(waitedMinutes) + ' min',
      views: {
        isFleet: st.view === 'fleet', isCards: st.view === 'cards', isTimeline: st.view === 'timeline',
        fleetPressed: String(st.view === 'fleet'), cardsPressed: String(st.view === 'cards'), timelinePressed: String(st.view === 'timeline'),
        fleetStyle: viewBtn(st.view === 'fleet'), cardsStyle: viewBtn(st.view === 'cards'), timelineStyle: viewBtn(st.view === 'timeline'),
        showFleet: function () { self.remember({ view: 'fleet' }); },
        showCards: function () { self.remember({ view: 'cards' }); },
        showTimeline: function () { self.remember({ view: 'timeline' }); }
      },
      hasChecked: checkedIds.length > 0,
      bulk: {
        count: String(checkedIds.length), draft: st.bulkDraft,
        typed: function (e) { self.setState({ bulkDraft: e.target.value }); },
        send: function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var text = (self.state.bulkDraft || '').trim();
          if (!text) return;
          checkedIds.forEach(function (id) { self.post('send', { id: id, text: text }); });
          self.setState({ bulkDraft: '' });
        },
        stop: function () {
          var chosen = live.filter(function (a) { return checkedIds.indexOf(a.id) >= 0; });
          if (!window.confirm('Stop ' + chosen.length + ' agent(s)? Background sessions stop; the others are left alone.')) return;
          chosen.forEach(function (a) { self.post('stop', { id: a.id, kind: a.kind }); });
        },
        clear: function () { self.setState({ checked: {} }); }
      },
      tabs: tabDefs.map(function (t) {
        var on = st.tab === t[0];
        return { label: t[1], selected: String(on), pick: function () { self.setState({ tab: t[0] }); },
          style: 'min-height: 40px; padding: 0 12px; border: none; background: transparent; margin-bottom: -1px; font-weight: 600; color: ' + (on ? 'var(--text)' : 'var(--muted)') + '; border-bottom: 2px solid ' + (on ? 'var(--work)' : 'transparent') };
      }),
      tabIs: { activity: st.tab === 'activity', changes: st.tab === 'changes', pr: st.tab === 'pr' },
      sel: !sel ? {} : {
        repo: sel.repo, name: sel.name, path: sel.path, branch: sel.branch, model: sel.model, mode: sel.mode,
        stateLabel: LABELS[sel.state], dot: dot(sel.health ? 'stuck' : sel.state, 10), pill: pill(sel.state),
        hasHealth: Boolean(sel.health), health: sel.health || '',
        usage: money(sel.cost) + ' spent · context ' + sel.ctx + '%' + (sel.effort ? ' · effort ' + sel.effort : '') + (sel.hasBeacon ? '' : ' · no beacon in this session'),
        hasPending: Boolean(p),
        kindLabel: p ? (p.kind === 'question' ? 'Asks you' : p.kind === 'edit' ? 'Wants to edit' : p.kind === 'local' ? 'Waiting in its terminal' : 'Wants to run') : '',
        detail: p ? p.detail : '',
        actions: this.actionsFor(sel),
        noFeed: (sel.feed || []).length === 0,
        feed: (sel.feed || []).slice().reverse().map(function (f) {
          return { t: f[0], icon: ICONS[f[1]] || '·', iconStyle: 'color: ' + (ICON_COLORS[f[1]] || 'var(--muted)') + '; font-weight: 700', text: f[2],
            textStyle: f[1] === 'you' ? 'color: var(--muted); font-style: italic' : (f[1] === 'wait' ? 'color: var(--warn)' : 'color: var(--text)') };
        }),
        add: String(sel.add), del: String(sel.del), files: String(sel.files),
        fileList: (sel.fileList || []).map(function (f) { return { path: f[0], add: String(f[1]), del: String(f[2]) }; }),
        hasPr: Boolean(sel.pr), noPr: !sel.pr,
        prTitle: sel.pr ? sel.pr.title : '', prUrl: sel.pr ? sel.pr.url : '#',
        checks: sel.pr ? sel.pr.checks.map(function (c) { var good = c[1] === 'pass'; return { name: c[0], icon: good ? '✓' : c[1] === 'pending' ? '…' : '✗', style: 'font-weight: 700; color: ' + (good ? 'var(--ok)' : c[1] === 'pending' ? 'var(--warn)' : 'var(--bad)') }; }) : [],
        reviews: sel.pr ? sel.pr.reviews : '',
        mergeLabel: sel.pr && sel.pr.mergeable ? 'Merge (squash)' : 'Merge (not ready)',
        mergeStyle: sel.pr && sel.pr.mergeable ? 'min-height: 40px; padding: 0 14px; border-radius: 8px; border: none; background: var(--ok); color: var(--on-ok); font-weight: 600' : 'min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--edge); background: transparent; color: var(--faint)',
        merge: function () {
          if (!sel.pr || !sel.pr.mergeable) { self.toast('This PR is not ready to merge.', true); return; }
          if (window.confirm('Squash-merge ' + sel.pr.title + ' and delete its branch?')) self.post('merge', { root: sel.repoRoot, number: sel.pr.num });
        },
        askPr: function () { self.post('send', { id: sel.id, text: 'Push this branch and open a pull request for it with gh pr create.' }); },
        openEditor: function () { self.post('open-editor', { path: sel.path }); },
        jump: function () { self.post('jump', { id: sel.id, kind: sel.kind, pid: sel.pid, path: sel.path }); },
        stop: function () { if (window.confirm('Stop ' + sel.repo + ' · ' + sel.name + '?')) self.post('stop', { id: sel.id, kind: sel.kind }); },
        commands: cmds.map(function (c) { return { value: '/' + c.name, label: c.description }; }),
        placeholder: !sel.canSteer ? 'This session can\'t receive from the cockpit yet' : p && p.kind === 'question' ? 'Type an answer…' : 'Send a prompt, or / for commands',
        cantSteer: !sel.canSteer,
        hasQueued: sel.queued > 0,
        queuedNote: sel.queued === 1 ? 'Waiting for ' + sel.name + ' to pick up your message…' : 'Waiting for ' + sel.name + ' to pick up ' + sel.queued + ' messages…',
        sendStyle: 'min-height: 44px; padding: 0 16px; border-radius: 8px; border: none; font-weight: 600; background: ' + (sel.canSteer ? 'var(--work)' : 'var(--chip)') + '; color: ' + (sel.canSteer ? 'var(--on-work)' : 'var(--faint)')
      },
      draft: st.draft,
      cmd: this.commandMenu(sel),
      typed: function (e) { self.setState({ draft: e.target.value, cmdClosed: false, cmdIndex: 0 }); },
      send: function (e) {
        if (e && e.preventDefault) e.preventDefault();
        var text = (self.state.draft || '').trim();
        if (!text || !sel) return;
        if (!sel.canSteer) { self.toast(sel.name + ' runs an older Tower plugin and can\'t receive from here. Restart it, then send again.', true); return; }
        var q =sel.pending && sel.pending.kind === 'question' && !text.startsWith('/');
        self.post(q ? 'answer' : 'send', q ? { id: sel.id, pendingId: sel.pending.id, text: text } : { id: sel.id, text: text });
        self.setState({ draft: '' });
      }
    };
  }
}
