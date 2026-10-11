var PREFS_KEY = 'tower-cockpit-prefs';
var COLORS = { needs: 'var(--warn)', working: 'var(--work)', done: 'var(--ok)', idle: 'var(--faint)', stuck: 'var(--bad)' };
var TINTS = { needs: 'var(--warn-tint)', working: 'var(--work-tint)', done: 'var(--ok-tint)', idle: 'var(--line-soft)', stuck: 'var(--bad-tint)' };
var LABELS = { needs: 'needs you', working: 'working', done: 'done', idle: 'idle' };
var RANK = { needs: 0, working: 1, done: 2, idle: 3 };
var ICONS = { you: '›', tool: '▸', say: '◆', wait: '!', sent: '↗' };
var ICON_COLORS = { you: 'var(--muted)', tool: 'var(--work)', say: 'var(--ok)', wait: 'var(--warn)', sent: 'var(--work)' };
var DIFF_STYLES = { hunk: 'color: var(--muted)', ctx: 'color: var(--text2)', del: 'color: var(--bad); background: var(--bad-tint2)', add: 'color: var(--ok); background: var(--ok-tint2)' };
var SEG = { working: 'var(--work)', needs: 'var(--warn)', stuck: 'var(--bad)', done: 'var(--ok)', idle: 'transparent' };
var MODELS = [['', 'Default model'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
var MODES = [['auto', 'auto'], ['acceptEdits', 'accept edits'], ['plan', 'plan first'], ['default', 'ask for everything']];
var EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// A subagent's status as one of the fleet's own state colors.
var SUB_TONES = { pending: 'working', running: 'working', waiting: 'needs', idle: 'idle', completed: 'done', failed: 'stuck', killed: 'stuck' };
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
// How wide the two side panels may be, in CSS pixels. The middle always keeps MAIN_MIN.
var PANELS = { rail: { min: 220, max: 560, def: 300 }, detail: { min: 320, max: 760, def: 440 } };
var MAIN_MIN = 360;
var COLLAPSED_PANEL = 64;
var BTN_PRIMARY ='min-height: 40px; padding: 0 14px; border-radius: 8px; border: none; background: var(--warn); color: var(--on-warn); font-weight: 600';
var BTN_SECONDARY = 'min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--warn-edge); background: transparent; color: var(--text)';

function dot(state, size) {
  return 'width: ' + size + 'px; height: ' + size + 'px; border-radius: 50%; flex: none; background: ' + (COLORS[state] || COLORS.idle);
}
function pill(state) {
  return 'justify-self: start; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: ' + TINTS[state] + '; color: ' + (state === 'idle' ? 'var(--muted)' : COLORS[state]);
}
function money(n) { return '$' + (Number(n) || 0).toFixed(2); }
// A meter's fill: amber from 70%, red from 90%, as the header's rate-limit chips.
function meter(percent) {
  var p = Math.max(0, Math.min(100, Number(percent) || 0));
  return 'display: block; height: 100%; width: ' + p + '%; background: ' + (p >= 90 ? 'var(--bad)' : p >= 70 ? 'var(--warn)' : 'var(--bar)');
}
function running(a) {
  var n = (a.subagents || []).filter(function (s) { return SUB_TONES[s.status] === 'working'; }).length;
  return n ? n + (n === 1 ? ' subagent' : ' subagents') + ' running' : '';
}
function doneKey(r) { return 'done:' + r.at + ':' + (r.id || r.name); }
function folderOf(path) { return String(path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop(); }
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
      data: { agents: [], repos: [], totals: { total: 0, needs: 0, working: 0, done: 0, alerts: 0, cost: 0 }, usage: { limits: [] }, done: [], groups: [], settings: {}, error: null },
      remoteDismissed: Boolean(saved.remoteDismissed), formCopies: 1, switching: {},
      conn: 'connecting', repo: 'all', ws: null, selected: null, draft: '', checked: {}, bulkDraft: '', tab: 'activity',
      view: saved.view || 'fleet', theme: saved.theme || 'system', systemLight: systemLight,
      folded: saved.folded || {}, railCollapsed: Boolean(saved.railCollapsed), detailCollapsed: Boolean(saved.detailCollapsed),
      railWidth: Number(saved.railWidth) || PANELS.rail.def, detailWidth: Number(saved.detailWidth) || PANELS.detail.def, dragging: null,
      formOpen: false, formRepo: null, formPath: null, formWorktree: true, formName: '', formBase: 'main', formModel: '', formMode: 'auto', formTask: '',
      toast: null, commands: {}, cmdIndex: 0, cmdClosed: false, menuFor: null
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
    // The ⋯ dropdown follows its button when the page scrolls or resizes; gone, it closes.
    var follow = function () {
      if (String(self.state.menuFor).indexOf('agent:') !== 0) return;
      if (self.menuAnchor && self.menuAnchor.isConnected) self.setState({ menuAt: self.anchorAt(self.menuAnchor) });
      else self.setState({ menuFor: null });
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
  }

  // Closing a row's dropdown hands focus back to its ⋯, so a keyboard user stays in place.
  closeAgentMenu() {
    var anchor = this.menuAnchor;
    this.setState({ menuFor: null });
    if (anchor && anchor.isConnected && anchor.focus) setTimeout(function () { anchor.focus(); }, 0);
  }

  anchorAt(b) {
    var r = b.getBoundingClientRect();
    return { top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, right: Math.max(8, window.innerWidth - r.right), up: r.bottom + 320 > window.innerHeight };
  }

  // A row's or card's ⋯ opens a dropdown fixed beside the button, drawn outside the table so
  // its scroll box never clips it; near the window's bottom it opens upward.
  openAgentMenu(id, e) {
    if (this.state.menuFor === 'agent:' + id) { this.setState({ menuFor: null }); return; }
    this.menuAnchor = (e && e.target && e.target.closest ? e.target.closest('button') : null) || document.body;
    this.setState({ menuFor: 'agent:' + id, menuAt: this.anchorAt(this.menuAnchor), menuConfirm: null });
    setTimeout(function () { var first = document.querySelector('#agent-menu [role=menuitem]'); if (first) first.focus(); }, 0);
  }

  // The typed path field in the rail, focused and empty.
  addRepoField() {
    this.setState({ addingRepo: true, repoDraft: '' });
    setTimeout(function () { var box = document.getElementById('add-repo-path'); if (box) box.focus(); }, 0);
  }

  // A new view starts at the top of the main column, not wherever the last one was scrolled.
  showView(view) {
    this.remember({ view: view });
    setTimeout(function () { var col = document.querySelector('main.tw-col'); if (col) col.scrollTo({ top: 0 }); }, 0);
  }

  remember(patch) {
    this.setState(patch, function () {
      var st = this.state;
      try { localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: st.theme, view: st.view, folded: st.folded, railCollapsed: st.railCollapsed, detailCollapsed: st.detailCollapsed, railWidth: st.railWidth, detailWidth: st.detailWidth, remoteDismissed: st.remoteDismissed })); } catch (err) {}
    });
  }

  // A panel's width, within its limits and the window: the middle keeps MAIN_MIN.
  clampPanel(which, px) {
    var st = this.state, p = PANELS[which];
    var other = which === 'rail' ? (st.detailCollapsed ? COLLAPSED_PANEL : st.detailWidth) : (st.railCollapsed ? COLLAPSED_PANEL : st.railWidth);
    var room = Math.max(p.min, window.innerWidth - other - MAIN_MIN);
    return Math.round(Math.max(p.min, Math.min(p.max, room, px)));
  }

  // Drag a grip: the pointer is captured, so the drag follows it past the panel and
  // out of the window; the width is saved when it is let go.
  startResize(which, e) {
    var self = this, grip = e.target, from = e.clientX, start = this.state[which + 'Width'], dir = which === 'rail' ? 1 : -1;
    e.preventDefault();
    if (grip.setPointerCapture) grip.setPointerCapture(e.pointerId);
    this.setState({ dragging: which });
    var move = function (ev) {
      var patch = {};
      patch[which + 'Width'] = self.clampPanel(which, start + dir * (ev.clientX - from));
      self.setState(patch);
    };
    var up = function () {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      self.remember({ dragging: null });
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }

  // Arrow keys move the grip 16px (64 with Shift), Home and End go to the limits.
  nudgePanel(which, e) {
    var p = PANELS[which], step = (e.shiftKey ? 64 : 16) * (which === 'rail' ? 1 : -1), now = this.state[which + 'Width'], to = null;
    if (e.key === 'ArrowRight') to = now + step;
    else if (e.key === 'ArrowLeft') to = now - step;
    else if (e.key === 'Home') to = p.min;
    else if (e.key === 'End') to = p.max;
    if (to === null) return;
    e.preventDefault();
    var patch = {};
    patch[which + 'Width'] = this.clampPanel(which, to);
    this.remember(patch);
  }

  resetPanel(which) {
    var patch = {};
    patch[which + 'Width'] = PANELS[which].def;
    this.remember(patch);
  }

  panelVals() {
    var self = this, st = this.state;
    return {
      // Shown width: a saved width from a bigger window still fits this one.
      railWidth: this.clampPanel('rail', st.railWidth), detailWidth: this.clampPanel('detail', st.detailWidth),
      railMin: PANELS.rail.min, railMax: PANELS.rail.max, detailMin: PANELS.detail.min, detailMax: PANELS.detail.max,
      railGrip: 'tw-grip' + (st.dragging === 'rail' ? ' on' : ''), detailGrip: 'tw-grip' + (st.dragging === 'detail' ? ' on' : ''),
      railDown: function (e) { self.startResize('rail', e); }, detailDown: function (e) { self.startResize('detail', e); },
      railKey: function (e) { self.nudgePanel('rail', e); }, detailKey: function (e) { self.nudgePanel('detail', e); },
      railReset: function () { self.resetPanel('rail'); }, detailReset: function () { self.resetPanel('detail'); }
    };
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
      .then(function (res) { if (!res.quiet) self.toast(res.message || (res.ok ? 'Done.' : 'Failed.'), !res.ok); return res; })
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

  // One ⋯ menu open at a time; choosing an item closes it.
  toggleMenu(id) {
    this.setState({ menuFor: this.state.menuFor === id ? null : id });
  }

  menuItem(label, danger, run) {
    var self = this;
    return {
      label: label,
      style: 'min-height: 34px; padding: 0 10px; border: none; border-radius: 6px; background: transparent; text-align: left; font-size: 13px; color: ' + (danger ? 'var(--bad-text)' : 'var(--text)'),
      run: function () { self.setState({ menuFor: null }); run(); }
    };
  }

  // A row's or card's ⋯ actions: the same list for every session, so it can be learned once.
  // What this session can't do stays listed, greyed, with the reason. The two that lose work
  // sit last, below a divider, and ask again in place instead of in a browser dialog.
  agentMenu(a) {
    var self = this, st = this.state, say = function (text) { self.post('send', { id: a.id, text: text }); };
    var has = function (name) { return (st.commands[a.id] || []).some(function (c) { return c.name === name; }); };
    var deaf = a.canSteer ? '' : 'This session can\'t receive from the cockpit';
    var item = function (label, why, run, confirmLabel) {
      var asking = Boolean(confirmLabel) && st.menuConfirm === label;
      return {
        isItem: true, isSep: false, label: asking ? confirmLabel : label, reason: why || '', hasReason: Boolean(why), off: Boolean(why),
        style: 'display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-height: 36px; padding: 6px 10px; border: none; border-radius: 6px; text-align: left; font: inherit; font-size: 13px; cursor: ' + (why ? 'default' : 'pointer') + '; background: ' + (asking ? 'var(--bad-tint)' : 'transparent') + '; color: ' + (why ? 'var(--faint)' : confirmLabel ? 'var(--bad-text)' : 'var(--text)') + (asking ? '; font-weight: 600' : ''),
        run: function () {
          if (why) return;
          if (confirmLabel && !asking) { self.setState({ menuConfirm: label }); return; }
          self.closeAgentMenu();
          run();
        }
      };
    };
    return [
      item('Continue', deaf || (a.state === 'done' || a.state === 'idle' ? '' : 'Only once it has finished or is idle'), function () { say('continue'); }),
      item('Compact', deaf, function () { say('/compact'); }),
      item('Rename…', deaf || (has('rename') ? '' : 'This session has no /rename command'), function () {
        var name = window.prompt('New name for ' + a.repo + ' · ' + a.name + ':', a.name);
        if (name && name.trim()) say('/rename ' + name.trim());
      }),
      item('Open in editor', '', function () { self.post('open-editor', { path: a.path }); }),
      item('Jump to terminal', '', function () { self.post('jump', { id: a.id, kind: a.kind, pid: a.pid, path: a.path }); }),
      { isItem: false, isSep: true },
      item('Clear conversation', deaf, function () { say('/clear'); }, 'Click again to clear it (files stay)'),
      item('Stop', a.kind === 'bg' ? '' : 'Only background agents stop from here', function () { self.post('stop', { id: a.id, kind: a.kind }); }, 'Click again to stop it')
    ];
  }

  // Refused while it has uncommitted changes; then a second, explicit confirm forces it.
  removeWorktree(root, w) {
    var self = this;
    if (!window.confirm('Remove the worktree ' + w.branch + ' at ' + w.path + '? Its branch is kept.')) return;
    var leave = function (res) { if (res.ok && self.state.ws === w.branch) self.setState({ ws: null }); };
    this.post('remove-worktree', { root: root, path: w.path }).then(function (res) {
      if (res.dirty && window.confirm(res.message + ' Remove anyway? Those changes are deleted for good.')) {
        self.post('remove-worktree', { root: root, path: w.path, force: true }).then(leave);
      } else {
        leave(res);
      }
    });
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
    this.setState({ formOpen: true, formRepo: root, formPath: path, formWorktree: worktree, formName: '', formTask: '', formBase: 'current', formCopies: 1 });
  }

  launch() {
    var st = this.state, self = this;
    var copies = st.formWorktree ? st.formCopies : 1;
    if (st.formWorktree && !st.formName.trim()) { this.toast('Name the workstream first.', true); return; }
    if (copies > 1 && !st.formTask.trim()) { this.toast('Give the agents a task to compare them on.', true); return; }
    this.post('launch', { repo: st.formWorktree ? st.formRepo : (st.formPath || st.formRepo), name: st.formName, base: st.formBase, task: st.formTask, model: st.formModel, mode: st.formMode, worktree: st.formWorktree, copies: copies })
      .then(function (res) {
        if (!res.ok) return;
        var branch = st.formName.trim().replace(/\s+/g, '-');
        // A fan-out shows as its comparison over the whole repo, not one workstream.
        self.setState({ formOpen: false, repo: st.formRepo, ws: res.group ? null : st.formWorktree ? branch : self.state.ws, selected: res.id || self.state.selected });
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
    var list = [
      { label: 'Allow  A', style: BTN_PRIMARY, run: function () { self.post('answer', { id: a.id, pendingId: p.id, allow: true }); } },
      { label: 'Deny  D', style: BTN_SECONDARY, run: function () { self.post('answer', { id: a.id, pendingId: p.id, allow: false }); } }
    ];
    // Only for a plain command the model judged safe to repeat; the server writes the rule.
    if (p.rule) {
      list.push({ label: 'Always allow', style: BTN_SECONDARY, run: function () {
        if (!window.confirm('Allow this now, and from now on run exactly\n\n' + p.detail + '\n\nwithout asking in ' + a.path + '? Tower adds ' + p.rule + ' to .claude/settings.local.json there.')) return;
        self.post('allow-always', { id: a.id, pendingId: p.id });
      } });
    }
    return list;
  }

  // J/K walk the waiting agents, A/D allow or deny, 1-4 answer, X selects, T toggles the timeline.
  onKey(e) {
    if (String(this.state.menuFor).indexOf('agent:') === 0) {
      var items = [].slice.call(document.querySelectorAll('#agent-menu [role=menuitem]'));
      var at = items.indexOf(document.activeElement);
      if (e.key === 'Escape' || e.key === 'Tab') { this.closeAgentMenu(); e.preventDefault(); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
        items[e.key === 'ArrowDown' ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1)].focus();
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'Escape' && String(this.state.selected).indexOf('done:') === 0) { this.setState({ selected: null }); e.preventDefault(); return; }
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    var list = this.agents();
    var needs = list.filter(function (a) { return a.state === 'needs'; });
    // A finished run in the panel is read-only: no key may answer an agent that isn't shown.
    var sel = String(this.state.selected).indexOf('done:') === 0 ? null : this.selectedAgent(list);
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

  // The dashboard: one line of facts, then where the money went (per day, per repo, the
  // costliest runs) and which agents are running out of context. One series per chart, so
  // color never stands for a category; every bar names its value on hover and in a hidden table.
  dashVals(data, live, waitedMinutes, duration) {
    var self = this;
    var stats = data.stats || { days: [], repos: [], top: [], runs: 0, cost: 0, avgSeconds: 0 };
    var maxDay = Math.max.apply(null, [0.01].concat(stats.days.map(function (d) { return d.cost; })));
    var maxRepo = Math.max.apply(null, [0.01].concat(stats.repos.map(function (r) { return r.cost; })));
    var date = function (day) { var d = new Date(day + 'T12:00:00'); return isNaN(d) ? day : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
    var runs = function (n) { return n === 1 ? '1 run' : n + ' runs'; };
    var peak = stats.days.reduce(function (a, d) { return d.cost > a.cost ? d : a; }, { cost: 0, day: '' });
    var today = stats.days[stats.days.length - 1] || { cost: 0, runs: 0 };
    var waited = Math.round(waitedMinutes);
    return {
      // The header already shows live spend and states; these are the numbers it doesn't.
      tiles: [
        { label: 'Runs, last 14 days', value: String(stats.runs), style: 'font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text)' },
        { label: 'Spent, last 14 days', value: money(stats.cost), style: 'font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text)' },
        { label: 'Average run', value: stats.runs ? duration(stats.avgSeconds) : '—', style: 'font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text)' },
        { label: 'Kept waiting, last hour', value: waited + ' min', style: 'font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; color: ' + (waited >= 5 ? 'var(--warn)' : 'var(--text)') }
      ],
      hasDays: stats.runs > 0, noDays: stats.runs === 0,
      maxDay: money(maxDay),
      daySummary: 'Spend on finished runs per day, last 14 days. ' + (peak.cost ? 'Highest ' + money(peak.cost) + ' on ' + date(peak.day) + '. ' : '') + 'Today ' + money(today.cost) + ' over ' + runs(today.runs) + '.',
      days: stats.days.map(function (d, i) {
        var last = i === stats.days.length - 1;
        return { date: date(d.day), cost: money(d.cost), runs: runs(d.runs), title: date(d.day) + ': ' + money(d.cost) + ' · ' + runs(d.runs),
          tick: last ? 'today' : i % 2 === 1 ? String(new Date(d.day + 'T12:00:00').getDate()) : '',
          // Today in the ink color, not the "working" cyan: it is a date, not a state.
          style: 'display: block; width: 100%; height: ' + (d.cost ? Math.max(2, d.cost / maxDay * 100) : 0) + '%; border-radius: 4px 4px 0 0; background: ' + (last ? 'var(--text2)' : 'var(--bar)') };
      }),
      repos: stats.repos.map(function (r) {
        return { repo: r.repo, value: money(r.cost) + ' · ' + runs(r.runs), title: r.repo + ': ' + money(r.cost) + ' over ' + runs(r.runs),
          style: 'display: block; height: 100%; border-radius: 0 4px 4px 0; width: ' + Math.max(1, r.cost / maxRepo * 100) + '%; background: var(--bar)' };
      }),
      top: (stats.top || []).map(function (r) {
        var rec = (data.done || []).filter(function (x) { return x.at === r.at && (x.id || x.name) === (r.id || r.name); })[0];
        return { name: r.repo + ' · ' + r.name, when: date(String(r.at).slice(0, 10)), cost: money(r.cost), took: duration(r.seconds),
          canOpen: Boolean(rec), noOpen: String(!rec), title: rec ? 'Open what this run did' : 'Older than the Done log keeps',
          open: function () { if (rec) self.setState({ selected: doneKey(rec), draft: '' }); } };
      }),
      hasTop: (stats.top || []).length > 0,
      contexts: live.slice().sort(function (a, b) { return b.ctx - a.ctx; }).slice(0, 6).map(function (a) {
        return { name: a.repo + ' · ' + a.name, pct: a.ctx + '%', title: 'Open ' + a.repo + ' · ' + a.name + ': context ' + a.ctx + '% full', bar: meter(a.ctx),
          open: function () { self.setState({ selected: a.id, draft: '' }); } };
      }),
      hasContexts: live.length > 0, noContexts: live.length === 0
    };
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
        menuOpen: st.menuFor === 'repo:' + r.root, menuExpanded: String(st.menuFor === 'repo:' + r.root),
        menuLabel: 'Actions for ' + r.name,
        toggleMenu: function () { self.toggleMenu('repo:' + r.root); },
        menu: isAll ? [] : [
          self.menuItem('Rename…', false, function () {
            var name = window.prompt('Name to show for ' + r.root + ' (only in the cockpit):', r.name);
            if (name && name.trim()) self.post('rename-repo', { root: r.root, name: name.trim() });
          }),
          self.menuItem('Remove from cockpit', true, function () {
            if (!window.confirm('Remove ' + r.name + ' from the cockpit? Nothing on disk changes, and its sessions keep running. Add it again any time with + Add repository.')) return;
            self.post('hide-repo', { root: r.root }).then(function (res) { if (res.ok && self.state.repo === r.root) self.setState({ repo: 'all', ws: null }); });
          })
        ],
        ws: r.worktrees.map(function (w) {
          var inWs = mine.filter(function (a) { return a.branch === w.branch; });
          var on = st.repo === r.root && st.ws === w.branch;
          var isMain = key(w.path) === key(r.root);
          var menuId = 'ws:' + r.root + '|' + w.branch;
          var items = [
            self.menuItem('New agent here', false, function () { self.openForm(r.root, w.path, false); self.setState({ repo: r.root, ws: w.branch }); }),
            self.menuItem('Open in editor', false, function () { self.post('open-editor', { path: w.path }); })
          ];
          if (!isMain) {
            items.push(self.menuItem('Rename branch…', false, function () {
              var to = window.prompt('New name for the branch ' + w.branch + ':', w.branch);
              if (!to || to.trim() === w.branch) return;
              self.post('rename-branch', { path: w.path, from: w.branch, to: to.trim() }).then(function (res) {
                if (res.ok && self.state.ws === w.branch) self.setState({ ws: to.trim().replace(/\s+/g, '-') });
              });
            }));
            items.push(self.menuItem('Remove worktree…', true, function () { self.removeWorktree(r.root, w); }));
          }
          return {
            name: w.branch, count: String(inWs.length), add: String(sum(inWs, 'add')), del: String(sum(inWs, 'del')),
            prShort: w.pr ? '· #' + w.pr.num : '',
            dot: dot(inWs.length ? worstOf(inWs) : 'idle', 7),
            style: 'flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 2px 8px; border-radius: 6px; border: none; color: var(--text); background: ' + (on ? 'var(--sel)' : 'transparent') + '; box-shadow: ' + (on ? 'inset 2px 0 0 var(--work)' : 'none'),
            pick: function () { self.setState({ repo: r.root, ws: w.branch }); },
            menuOpen: st.menuFor === menuId, menuExpanded: String(st.menuFor === menuId),
            menuLabel: 'Actions for ' + w.branch,
            toggleMenu: function () { self.toggleMenu(menuId); },
            menu: items
          };
        })
      };
    });

    var scoped = live.filter(function (a) { return (st.repo === 'all' || key(a.repoRoot) === key(st.repo)) && (!st.ws || a.branch === st.ws); });
    // A finished run whose session has ended takes the panel, read-only, until an agent is picked.
    var run = (data.done || []).filter(function (r) { return st.selected === doneKey(r); })[0] || null;
    var sel = run ? null : this.selectedAgent(scoped.length ? scoped : live);
    if (sel) this.loadCommands(sel.id);

    var agents = scoped.map(function (a) {
      var chosen = sel && a.id === sel.id;
      var pr = a.pr ? ('#' + a.pr.num + (a.pr.checks.some(function (c) { return c[1] === 'fail'; }) ? ' · CI ✗' : a.pr.checks.length ? ' · CI ✓' : '') + (a.pr.mergeable ? ' · ready' : '')) : '—';
      return {
        repo: a.repo, name: a.name, branch: a.branch, kindTag: a.kind, stateLabel: LABELS[a.state], doing: a.doing, ctx: a.ctx + '%', cost: money(a.cost),
        add: String(a.add), del: String(a.del), files: String(a.files), pr: pr,
        prStyle: "font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: " + (!a.pr ? 'var(--faint)' : (pr.indexOf('✗') >= 0 ? 'var(--bad)' : 'var(--ok)')),
        hasHealth: Boolean(a.health), health: a.health || '',
        dot: dot(a.health ? 'stuck' : a.state, 10), pill: pill(a.state),
        ctxBar: meter(a.ctx),
        subsRunning: running(a), hasSubsRunning: running(a) !== '',
        rowStyle: 'display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; border-bottom: 1px solid var(--line-soft); background: ' + (chosen ? 'var(--row-sel)' : 'transparent') + '; box-shadow: ' + (chosen ? 'inset 3px 0 0 var(--work)' : 'none'),
        cardStyle: 'display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 12px; background: ' + (chosen ? 'var(--row-sel)' : 'var(--panel)') + '; border: 1px solid ' + (chosen ? 'var(--info-edge)' : 'var(--line)') + '; border-top: 3px solid ' + COLORS[a.health ? 'stuck' : a.state],
        checked: Boolean(st.checked[a.id]),
        toggle: function () { var c = Object.assign({}, self.state.checked); if (c[a.id]) delete c[a.id]; else c[a.id] = true; self.setState({ checked: c }); },
        pick: function () { self.setState({ selected: a.id, draft: '' }); },
        menuExpanded: String(st.menuFor === 'agent:' + a.id),
        menuLabel: 'Actions for ' + a.repo + ' · ' + a.name,
        toggleMenu: function (e) { self.loadCommands(a.id); self.openAgentMenu(a.id, e); }
      };
    });

    var needs = scoped.filter(function (a) { return a.state === 'needs' && a.pending; }).map(function (a) {
      var p = a.pending, old = a.waited >= 5;
      return {
        repo: a.repo, name: a.name, waited: a.waited + 'm', detail: p.detail, why: p.why || '', hasWhy: Boolean(p.why),
        waitStyle: "flex: none; white-space: nowrap; font-size: 12px; font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: " + (old ? 'var(--bad)' : 'var(--warn)'),
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
        pick: function () { self.setState({ selected: a.id, draft: '' }); },
        rowStyle: 'display: grid; grid-template-columns: minmax(120px, 200px) minmax(0, 1fr); gap: 12px; align-items: center; width: calc(100% + 12px); min-height: 32px; padding: 2px 6px; margin: 0 -6px; border: none; border-radius: 6px; text-align: left; font: inherit; color: var(--text); cursor: pointer; background: ' + (sel && sel.id === a.id ? 'var(--row-sel)' : 'transparent'),
        segs: (a.lane || []).filter(function (s) { return s[2] !== 'idle'; }).map(function (s) {
          return { title: s[2] + ' ' + Math.round(60 - s[0]) + '–' + Math.round(60 - s[1]) + ' min ago',
            style: 'position: absolute; top: 3px; bottom: 3px; border-radius: 3px; left: ' + (s[0] / 60 * 100) + '%; width: ' + ((s[1] - s[0]) / 60 * 100) + '%; background: ' + SEG[s[2]] };
        })
      };
    });

    var checkedIds = Object.keys(st.checked).filter(function (id) { return live.some(function (a) { return a.id === id; }); });
    var subs = (sel && sel.subagents) || [];
    var tabDefs = [['activity', 'Activity'], ['changes', 'Changes'], ['subagents', subs.length ? 'Subagents · ' + subs.length : 'Subagents'], ['pr', 'Pull request']];
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
    var moving = function (what) { var m = sel && st.switching[sel.id + '|' + what]; return m && m.from === sel[what] ? m : null; };
    var movingModel = moving('model'), movingEffort = moving('effort');
    var inScope = function (root) { return st.repo === 'all' || key(root) === key(st.repo); };
    var scopeName = wsRepo ? wsRepo.name : null;
    var chip = function (tone) { return 'display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; font-size: 13px; font-family: \'IBM Plex Mono\', monospace; background: ' + (tone === 'bad' ? 'var(--bad-tint)' : tone === 'warn' ? 'var(--warn-tint)' : 'var(--chip)') + '; color: ' + (tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--muted)'); };
    // "9m", not "9m 0s": a zero part says nothing.
    var duration = function (s) {
      s = Math.round(s);
      if (s < 60) return s + 's';
      if (s < 3600) return Math.floor(s / 60) + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : '');
      var m = Math.round((s % 3600) / 60);
      return Math.floor(s / 3600) + 'h' + (m ? ' ' + m + 'm' : '');
    };
    var changes = function (x) { return '+' + (x.add || 0) + ' −' + (x.del || 0) + ' · ' + (x.files || 0) + ' files'; };

    var limits = ((data.usage && data.usage.limits) || []).map(function (l) {
      return { text: l.label + ' ' + l.percent + '%' + (l.resets ? ' · resets ' + l.resets : ''), title: l.label + ' rate limit: ' + l.percent + '% used' + (l.resets ? ', resets in ' + l.resets : ''),
        style: chip(l.percent >= 90 ? 'bad' : l.percent >= 70 ? 'warn' : '') };
    });

    var whenOf = function (at) {
      var when = new Date(at);
      if (isNaN(when.getTime())) return { time: '', day: '' };
      return { time: String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0'),
        day: when.toDateString() === new Date().toDateString() ? 'today' : when.toLocaleDateString() };
    };
    var doneItems = (data.done || []).filter(function (r) { return st.repo === 'all' || r.repo === scopeName; }).map(function (r) {
      var when = whenOf(r.at), on = run === r;
      return {
        when: when.time, day: when.day,
        repo: r.repo, name: r.name, branch: r.branch, summary: r.summary || 'Finished.', changes: changes(r),
        took: duration(r.seconds || 0), cost: money(r.cost), pr: r.pr ? r.pr.title : '', hasPr: Boolean(r.pr),
        rowStyle: 'display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; align-items: baseline; width: 100%; padding: 12px 16px; border: none; text-align: left; font: inherit; color: var(--text); background: ' + (on ? 'var(--row-sel)' : 'transparent') + '; box-shadow: ' + (on ? 'inset 3px 0 0 var(--ok)' : 'none'),
        // Still running: its live panel says more than the record does.
        open: function () {
          var alive = r.id && live.some(function (a) { return a.id === r.id; });
          self.setState({ selected: alive ? r.id : doneKey(r), draft: '' });
        }
      };
    });

    var groups = (data.groups || []).filter(function (g) { return inScope(g.root); }).map(function (g) {
      return {
        name: g.name, task: g.task, count: String(g.members.length),
        members: g.members.map(function (m) {
          return {
            branch: m.branch, stateLabel: LABELS[m.state] || m.state, pill: pill(m.state), doing: m.summary || m.doing,
            changes: changes(m), cost: money(m.cost), pr: m.pr ? m.pr.title : 'no PR', hasHealth: Boolean(m.health), health: m.health || '',
            style: 'display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); border-top: 3px solid ' + (COLORS[m.health ? 'stuck' : m.state] || COLORS.idle),
            open: function () { if (m.id) self.setState({ selected: m.id }); },
            keep: function () {
              var n = g.members.length - 1;
              if (!window.confirm('Keep ' + m.branch + '? The other ' + n + ' agent' + (n === 1 ? '' : 's') + ' stop and their worktrees are removed (their branches are kept). ' + m.branch + ' is asked for a pull request if it has none.')) return;
              self.post('keep-fanout', { group: g.id, branch: m.branch });
            }
          };
        })
      };
    });

    var queues = repoList.filter(function (r) { return inScope(r.root) && (r.ready || []).length >= 2; }).map(function (r) {
      return {
        text: r.ready.length + ' pull requests in ' + r.name + ' are green: ' + r.ready.map(function (x) { return '#' + x.num; }).join(', '),
        run: function () {
          if (!window.confirm('Squash-merge ' + r.ready.map(function (x) { return x.title; }).join(', ') + ' in that order, deleting their branches? Each is checked again just before its merge; the queue stops at the first that is no longer green.')) return;
          self.post('merge-queue', { root: r.root });
        }
      };
    });

    var settings = data.settings || {};
    var optIn = !st.remoteDismissed && Boolean(settings.remoteAnswers) && settings.remoteAnswers !== 'always'
      && live.some(function (a) { return a.pending && a.pending.kind === 'local'; });

    return {
      usage: { limits: limits },
      floatMenu: (function () {
        var id = String(st.menuFor).indexOf('agent:') === 0 ? st.menuFor.slice(6) : null;
        var a = id && live.filter(function (x) { return x.id === id; })[0];
        if (!a || !st.menuAt) return { open: false };
        var at = st.menuAt;
        return {
          open: true, label: 'Actions for ' + a.repo + ' · ' + a.name, items: self.agentMenu(a),
          close: function () { self.closeAgentMenu(); },
          style: 'position: fixed; z-index: 21; right: ' + at.right + 'px; ' + (at.up ? 'bottom: ' + at.bottom : 'top: ' + at.top) + 'px; min-width: 240px; max-width: 320px; display: flex; flex-direction: column; padding: 4px; border-radius: 10px; border: 1px solid var(--edge); background: var(--panel); box-shadow: 0 12px 32px rgba(0,0,0,0.28)'
        };
      })(),
      doneLog: {
        items: doneItems, empty: doneItems.length === 0, any: doneItems.length > 0,
        count: doneItems.length === 1 ? '1 finished run' : doneItems.length + ' finished runs',
        clear: function () {
          if (!window.confirm('Clear the Done log? Every finished run is forgotten (~/.claude/tower/history.jsonl is deleted). Running sessions are not touched.')) return;
          self.post('clear-done', {}).then(function (res) { if (res.ok && String(self.state.selected).indexOf('done:') === 0) self.setState({ selected: null }); });
        }
      },
      compare: { show: groups.length > 0, groups: groups },
      queue: { show: queues.length > 0, items: queues },
      optIn: {
        show: optIn,
        turnOn: function () { self.post('remote-answers', { value: 'always' }).then(function (res) { if (res.ok) self.remember({ remoteDismissed: true }); }); },
        later: function () { self.remember({ remoteDismissed: true }); }
      },
      panels: this.panelVals(),
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
      // Adding a repository happens in the rail itself, not in a browser prompt.
      addRepoForm: {
        isOpen: Boolean(st.addingRepo), closed: !st.addingRepo, draft: st.repoDraft || '',
        label: st.pickingRepo ? 'Choose a folder in the dialog…' : '+ Add repository',
        // The OS's folder dialog, opened by the server; the typed field is the fallback.
        browse: function () {
          if (self.state.pickingRepo) return;
          self.setState({ pickingRepo: true });
          self.post('pick-repo', {}).then(function (res) {
            self.setState({ pickingRepo: false });
            if (res.unavailable) self.addRepoField();
          });
        },
        open: function () { self.addRepoField(); },
        typed: function (e) { self.setState({ repoDraft: e.target.value }); },
        key: function (e) { if (e.key === 'Escape') { e.preventDefault(); self.setState({ addingRepo: false }); } },
        cancel: function () { self.setState({ addingRepo: false }); },
        submit: function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var path = String(self.state.repoDraft || '').trim();
          if (!path) return;
          // On failure the box stays open with what was typed, so the path can be fixed.
          self.post('add-repo', { path: path }).then(function (res) { if (res.ok) self.setState({ addingRepo: false, repoDraft: '' }); });
        }
      },
      detail: {
        isCollapsed: Boolean(sel) && st.detailCollapsed, isOpen: Boolean(sel) && !st.detailCollapsed,
        toggle: function () { self.remember({ detailCollapsed: !self.state.detailCollapsed }); }
      },
      run: !run ? { show: false } : {
        show: true,
        ended: 'Finished ' + whenOf(run.at).time + ' ' + whenOf(run.at).day + '. This session has ended, so this is what it recorded.',
        repo: run.repo, name: run.name, branch: run.branch || '—',
        folder: folderOf(run.path) || run.repo, path: run.path || '', hasPath: Boolean(run.path),
        model: run.model || '', hasModel: Boolean(run.model),
        took: duration(run.seconds || 0), cost: money(run.cost), changes: changes(run),
        answer: run.answer || run.summary || 'It recorded no final message.',
        files: (run.fileList || []).map(function (f) { return { path: f[0], add: String(f[1]), del: String(f[2]) }; }),
        hasFiles: Boolean(run.fileList && run.fileList.length),
        hasPr: Boolean(run.pr), prTitle: run.pr ? run.pr.title : '', prUrl: (run.pr && run.pr.url) || '', hasPrUrl: Boolean(run.pr && run.pr.url), noPrUrl: !(run.pr && run.pr.url),
        openEditor: function () { self.post('open-editor', { path: run.path }); },
        close: function () { self.setState({ selected: null }); }
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
        submitLabel: !st.formWorktree ? 'Start agent' : st.formCopies > 1 ? 'Start ' + st.formCopies + ' agents' : 'Create workstream',
        copies: [1, 2, 3, 4].map(function (n) { return { value: String(n), label: n === 1 ? 'One agent' : n + ' agents on the same task, to compare', selected: n === st.formCopies }; }),
        pickCopies: function (e) { self.setState({ formCopies: Number(e.target.value) || 1 }); },
        preview: st.formWorktree
          ? (slug ? (st.formCopies > 1 ? st.formCopies + '× ' : '') + 'claude --bg -w ' + slug + (st.formCopies > 1 ? '-1…' + st.formCopies : '') + (st.formModel ? ' --model ' + st.formModel : '') + ' --permission-mode ' + st.formMode + ' -- "' + (st.formTask || '…') + '"' : 'Name the workstream to see the worktree and command it will create.')
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
        remove: function () { self.removeWorktree(wsRepo.root, wsTree); }
      },
      fleet: { total: String(data.totals.total), needs: String(data.totals.needs), working: String(data.totals.working), done: String(data.totals.done), alerts: String(data.totals.alerts), cost: money(data.totals.cost) },
      repos: repos,
      scopeLabel: st.repo === 'all' ? 'all repositories' : ((wsRepo ? wsRepo.name : '') + (st.ws ? ' ⎇ ' + st.ws : ' · all workstreams')),
      agents: agents, lanes: lanes, needs: needs, hasNeeds: needs.length > 0,
      waitedTotal: Math.round(waitedMinutes) + ' min',
      views: {
        isFleet: st.view === 'fleet', isCards: st.view === 'cards', isTimeline: st.view === 'timeline', isDone: st.view === 'done',
        fleetPressed: String(st.view === 'fleet'), cardsPressed: String(st.view === 'cards'), timelinePressed: String(st.view === 'timeline'), donePressed: String(st.view === 'done'),
        fleetStyle: viewBtn(st.view === 'fleet'), cardsStyle: viewBtn(st.view === 'cards'), timelineStyle: viewBtn(st.view === 'timeline'), doneStyle: viewBtn(st.view === 'done'),
        showFleet: function () { self.showView('fleet'); },
        showCards: function () { self.showView('cards'); },
        showTimeline: function () { self.showView('timeline'); },
        showDone: function () { self.showView('done'); },
        isDash: st.view === 'dash', dashPressed: String(st.view === 'dash'), dashStyle: viewBtn(st.view === 'dash'),
        showDash: function () { self.showView('dash'); },
        isTriage: st.view === 'fleet' || st.view === 'cards',
        showNeeds: function () {
          self.showView(st.view === 'cards' ? 'cards' : 'fleet');
        }
      },
      dash: this.dashVals(data, live, waitedMinutes, duration),
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
      tabIs: { activity: st.tab === 'activity', changes: st.tab === 'changes', subagents: st.tab === 'subagents', pr: st.tab === 'pr' },
      sel: !sel ? {} : {
        repo: sel.repo, name: sel.name, path: sel.path, branch: sel.branch, model: sel.model, mode: sel.mode,
        stateLabel: LABELS[sel.state], dot: dot(sel.health ? 'stuck' : sel.state, 10), pill: pill(sel.state),
        hasHealth: Boolean(sel.health), health: sel.health || '',
        folder: folderOf(sel.path) || sel.repo,
        // The worktree folder only says something new when it is neither the repo nor the branch.
        showFolder: [sel.repo, String(sel.branch).replace(/[\/]/g, '-')].indexOf(folderOf(sel.path)) < 0 && Boolean(sel.path),
        costText: money(sel.cost) + (sel.budget ? ' of ' + money(sel.budget) : ' spent'),
        hasBudget: Boolean(sel.budget), noBudget: !sel.budget, costBar: meter(sel.budget ? sel.cost / sel.budget * 100 : 0),
        ctx: String(sel.ctx), ctxBar: meter(sel.ctx),
        noBeacon: !sel.hasBeacon,
        // Model and effort switch by sending the slash command, which runs once the session is idle.
        // Until it reports the new value, the current one reads "old → new…".
        steerTitle: sel.canSteer ? 'Sends the slash command; it applies when the session is idle' : 'This session can\'t receive from the cockpit',
        models: (function () {
          var to = movingModel ? ' → ' + movingModel.to + '…' : '';
          return [{ value: '', label: (sel.model || 'Model') + to }].concat(MODELS.filter(function (m) {
            return m[0] && String(sel.model || '').toLowerCase().indexOf(m[0]) !== 0;
          }).map(function (m) { return { value: m[0], label: m[1] }; }));
        })(),
        pickModel: function (e) {
          var v = e.target.value, label = (MODELS.filter(function (m) { return m[0] === v; })[0] || [])[1];
          if (!v || !sel.canSteer) return;
          self.post('send', { id: sel.id, text: '/model ' + v });
          self.setState({ switching: Object.assign({}, self.state.switching, { [sel.id + '|model']: { from: sel.model, to: label } }) });
        },
        hasEffort: Boolean(sel.effort) && cmds.some(function (c) { return c.name === 'effort'; }),
        effortValue: sel.effort || '',
        efforts: (EFFORTS.indexOf(sel.effort) < 0 && sel.effort ? [sel.effort] : []).concat(EFFORTS).map(function (v) {
          return { value: v, label: v + (movingEffort && v === sel.effort ? ' → ' + movingEffort.to + '…' : '') };
        }),
        pickEffort: function (e) {
          var v = e.target.value;
          if (!v || v === sel.effort || !sel.canSteer) return;
          self.post('send', { id: sel.id, text: '/effort ' + v });
          self.setState({ switching: Object.assign({}, self.state.switching, { [sel.id + '|effort']: { from: sel.effort, to: v } }) });
        },
        hasPending: Boolean(p),
        kindLabel: p ? (p.kind === 'question' ? 'Asks you' : p.kind === 'edit' ? 'Wants to edit' : p.kind === 'local' ? 'Waiting in its terminal' : 'Wants to run') : '',
        detail: p ? p.detail : '',
        actions: this.actionsFor(sel),
        noFeed: (sel.feed || []).length === 0,
        feed: (sel.feed || []).slice().reverse().map(function (f) {
          return { t: f[0], icon: ICONS[f[1]] || '·', iconStyle: 'color: ' + (ICON_COLORS[f[1]] || 'var(--muted)') + '; font-weight: 700', text: f[2],
            textStyle: f[1] === 'you' ? 'color: var(--muted); font-style: italic' : (f[1] === 'wait' ? 'color: var(--warn)' : 'color: var(--text)') };
        }),
        noSubagents: subs.length === 0,
        subagents: subs.map(function (s) {
          var tone = SUB_TONES[s.status] || 'idle';
          return { description: s.description || s.name || s.type, type: s.type, statusLabel: s.status, pill: pill(tone),
            doing: s.doing || (tone === 'working' ? 'Starting…' : ''), hasDoing: Boolean(s.doing || tone === 'working'),
            tools: s.tools ? s.tools + (s.tools === 1 ? ' tool call' : ' tool calls') : '',
            // One level of nesting is enough to tell a subagent's own subagents apart.
            style: 'display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); margin-left: ' + (s.parentId ? '18px' : '0') };
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
