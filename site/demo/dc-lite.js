// A small renderer for the cockpit mockup's .dc.html file, so the site can run the
// mockup live instead of showing recordings of it. It supports what that file uses:
// {{path}} holes, <sc-for>, <sc-if>, on* handlers, and a DCLogic class whose
// renderVals() feeds the template. Every setState re-renders the whole tree.
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
  const EVENTS = { onClick: 'click', onSubmit: 'submit', onInput: 'input' }

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
        const handler = lookup(whole[1], scopes)
        if (typeof handler === 'function') el.addEventListener(eventFor(attr, node), handler)
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
    const map = { onclick: 'onClick', onchange: 'onChange', onsubmit: 'onSubmit', oninput: 'onInput' }
    return map[name] || name
  }

  // Re-rendering rebuilds the inputs; keep the one being typed in focused, caret and all.
  function snapshotFocus(root) {
    const el = document.activeElement
    if (!el || !root.contains(el) || !el.id) return null
    return { id: el.id, start: el.selectionStart, end: el.selectionEnd }
  }

  function restoreFocus(root, saved) {
    if (!saved) return
    const el = root.querySelector('#' + CSS.escape(saved.id))
    if (!el) return
    el.focus()
    if (saved.start != null && el.setSelectionRange) el.setSelectionRange(saved.start, saved.end)
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
    instance.__render = () => {
      const saved = snapshotFocus(root)
      const vals = instance.renderVals()
      const out = document.createDocumentFragment()
      renderNodes(template.childNodes, [vals], out)
      root.replaceChildren(out)
      restoreFocus(root, saved)
    }
    instance.__render()
    if (instance.componentDidMount) instance.componentDidMount()
    return instance
  }

  window.DCLite = { mount }
})()
