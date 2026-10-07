// A small renderer for the cockpit's .dc.html file: the site's live demo and the real
// cockpit both run on it. It supports what that file uses: {{path}} holes, <sc-for>,
// <sc-if>, on* handlers, and a DCLogic class whose renderVals() feeds the template.
// Every setState renders a fresh tree and patches the page to match it, so an open
// dropdown, a scrolled list or a selection survives a live update.
(function () {
  'use strict'

  class DCLogic {
    constructor(props) {
      this.props = props || {}
      this.state = {}
    }

    setState(patch, done) {
      const next = typeof patch === 'function' ? patch(this.state) : patch
      this.state = Object.assign({}, this.state, next)
      this.__render()
      if (done) done.call(this)
    }

    forceUpdate() {
      this.__render()
    }
  }

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g
  const WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/
  const EVENTS = { onClick: 'click', onSubmit: 'submit', onInput: 'input', onKeyDown: 'keydown', onPointerDown: 'pointerdown', onDblClick: 'dblclick' }

  function lookup(path, scopes) {
    if (path === 'true') return true
    if (path === 'false') return false
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path)
    const [head, ...rest] = path.split('.')
    let value
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (head in scopes[i]) { value = scopes[i][head]; break }
    }
    for (const key of rest) value = value == null ? undefined : value[key]
    return value
  }

  const text = value => (value == null ? '' : String(value))

  function interpolate(source, scopes) {
    return source.replace(HOLE, (_, path) => text(lookup(path, scopes)))
  }

  // A text input or textarea reports onChange as it is typed in, as React does.
  function eventFor(attr, el) {
    if (attr !== 'onChange') return EVENTS[attr]
    const tag = el.tagName
    const type = (el.getAttribute('type') || '').toLowerCase()
    return tag === 'TEXTAREA' || (tag === 'INPUT' && type !== 'checkbox' && type !== 'radio') ? 'input' : 'change'
  }

  function renderNodes(nodes, scopes, out) {
    for (const node of nodes) renderNode(node, scopes, out)
  }

  function renderNode(node, scopes, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.appendChild(document.createTextNode(interpolate(node.nodeValue, scopes)))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName.toLowerCase()

    if (tag === 'sc-for') {
      const list = lookup(WHOLE.exec(node.getAttribute('list'))[1], scopes) || []
      const as = node.getAttribute('as') || 'item'
      list.forEach((item, index) => renderNodes(node.childNodes, scopes.concat({ [as]: item, $index: index }), out))
      return
    }
    if (tag === 'sc-if') {
      if (lookup(WHOLE.exec(node.getAttribute('value'))[1], scopes)) renderNodes(node.childNodes, scopes, out)
      return
    }
    if (tag === 'helmet') return

    const el = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(node.namespaceURI, node.tagName)
      : document.createElement(tag)
    const late = []
    for (const { name, value } of Array.from(node.attributes)) {
      if (name.startsWith('hint-')) continue
      const whole = WHOLE.exec(value)
      const attr = node.getAttributeNames ? reactName(name) : name
      if (whole && attr.startsWith('on') && attr.length > 2) {
        // Kept on the element; one listener on the root calls it (see delegate).
        const handler = lookup(whole[1], scopes)
        if (typeof handler === 'function') (el.__on || (el.__on = {}))[eventFor(attr, node)] = handler
        continue
      }
      const resolved = whole ? lookup(whole[1], scopes) : interpolate(value, scopes)
      if (name === 'checked') { el.checked = Boolean(resolved); continue }
      if (name === 'value') { late.push(() => { el.value = text(resolved) }); continue }
      el.setAttribute(name, text(resolved))
    }
    renderNodes(node.childNodes, scopes, el)
    late.forEach(set => set())
    out.appendChild(el)
  }

  // The HTML parser lower-cases attribute names; the template's handlers are camelCase.
  function reactName(name) {
    const map = { onclick: 'onClick', onchange: 'onChange', onsubmit: 'onSubmit', oninput: 'onInput', onkeydown: 'onKeyDown', onpointerdown: 'onPointerDown', ondblclick: 'onDblClick' }
    return map[name] || name
  }

  // Patch `live` to look like `next`, keeping every node that can stay. Elements match by
  // position and tag; anything else is replaced.
  function morph(live, next) {
    if (live.nodeType !== next.nodeType || live.nodeName !== next.nodeName) {
      live.replaceWith(next)
      return
    }
    if (live.nodeType === Node.TEXT_NODE) {
      if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue
      return
    }
    if (live.nodeType !== Node.ELEMENT_NODE) return
    for (const { name } of Array.from(live.attributes)) if (!next.hasAttribute(name)) live.removeAttribute(name)
    for (const { name, value } of Array.from(next.attributes)) if (live.getAttribute(name) !== value) live.setAttribute(name, value)
    live.__on = next.__on
    morphChildren(live, next)
    // Form state lives in properties. Typing writes the page's value first, so a value that
    // differs from the box is the page's own change (a picked command) and wins.
    if ('checked' in next && live.checked !== next.checked) live.checked = next.checked
    if ('value' in next && live.value !== next.value) live.value = next.value
  }

  // Children pair up by id when they have one (so an input keeps its focus when a menu
  // opens before it), else by order and tag. Nodes with no partner are added or removed;
  // a node is only moved when the order truly changed, since moving a node blurs it.
  function morphChildren(live, next) {
    const want = Array.from(next.childNodes)
    const have = Array.from(live.childNodes)
    const idOf = node => (node.nodeType === Node.ELEMENT_NODE && node.id) || ''
    const byId = new Map(have.filter(idOf).map(node => [node.id, node]))
    const used = new Set()
    let scan = 0
    // What the last node became: 'start', 'new' (it has no partner) or its live partner.
    // A text node pairs only with the text that follows that partner now, so the text
    // between two elements never changes sides when an element appears or goes.
    let prev = 'start'
    const partners = want.map(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        const cand = prev === 'start' ? live.firstChild : prev === 'new' ? null : prev.nextSibling
        if (cand && cand.nodeType === node.nodeType && !used.has(cand)) { used.add(cand); prev = cand; return cand }
        prev = 'new'
        return null
      }
      const id = idOf(node)
      let found = null
      if (id) {
        const hit = byId.get(id)
        if (hit && !used.has(hit)) found = hit
      } else {
        for (let j = scan; j < have.length; j++) {
          const cand = have[j]
          if (used.has(cand) || idOf(cand) || cand.nodeName !== node.nodeName) continue
          found = cand
          scan = j + 1
          break
        }
      }
      if (found) used.add(found)
      prev = found ?? 'new'
      return found
    })
    for (const node of have) if (!used.has(node)) node.remove()
    let cursor = live.firstChild
    want.forEach((node, i) => {
      const partner = partners[i]
      if (!partner) { live.insertBefore(node, cursor); return }
      if (partner !== cursor) live.insertBefore(partner, cursor)
      else cursor = cursor.nextSibling
      morph(partner, node)
    })
  }

  // One listener per event type on the root: the nearest element with a handler gets it.
  function delegate(root) {
    for (const type of ['click', 'input', 'change', 'submit', 'keydown', 'pointerdown', 'dblclick']) {
      root.addEventListener(type, e => {
        for (let el = e.target; el && el !== root.parentNode; el = el.parentNode) {
          const handler = el.__on && el.__on[type]
          if (handler) { handler(e); return }
        }
      })
    }
  }

  async function mount(root, url) {
    const source = await (await fetch(url)).text()
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const template = doc.querySelector('x-dc')
    const helmet = template.querySelector('helmet')
    if (helmet) for (const child of Array.from(helmet.children)) document.head.appendChild(document.importNode(child, true))

    const code = doc.querySelector('script[data-dc-script]').textContent
    const Component = new Function('DCLogic', code + '\nreturn Component;')(DCLogic)
    const instance = new Component({})
    delegate(root)
    instance.__render = () => {
      const vals = instance.renderVals()
      const out = document.createElement('div')
      renderNodes(template.childNodes, [vals], out)
      morphChildren(root, out)
    }
    instance.__render()
    if (instance.componentDidMount) instance.componentDidMount()
    return instance
  }

  window.DCLite = { mount }
})()
