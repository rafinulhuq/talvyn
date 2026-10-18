/* Build-time only. Run: node wordpress-landing/export.cjs */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const base = path.resolve(__dirname, '../frontend');
const req = createRequire(path.join(base, 'package.json'));
const ts = req('typescript');
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const { JSDOM } = req('jsdom');
const postcss = req('postcss');
const tailwind = req('@tailwindcss/postcss');

function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    if (!path.extname(file)) file = ['.tsx', '.ts'].map(ext => file + ext).find(fs.existsSync);
    if (cache.has(file)) return cache.get(file).exports;
    let source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('LandingNav.tsx')) source = source.replace('useState(false)', 'useState(true)');
    if (file.endsWith('AssessmentTypesSection.tsx') && overrides.role) source = source.replace('useState<string>("marketing")', `useState<string>(${JSON.stringify(overrides.role)})`);
    if (file.endsWith('DashboardMockup.tsx') && overrides.tab) source = source.replace('>("leaderboard")', `>(${JSON.stringify(overrides.tab)})`);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = { exports: {} };
    cache.set(file, mod);
    const localRequire = id => {
      if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
      if (id === 'next/navigation') return { usePathname: () => '/' };
      if (id.startsWith('@/')) return load(path.join(base, 'src', id.slice(2)));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
      return req(id);
    };
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  }
  return load;
}
const load = loader();
const { defaultHomeContent: home, defaultSiteContent: site } = load(path.join(base, 'src/lib/cms/content.ts'));
const { getDefaultBlogList } = load(path.join(base, 'src/lib/cms/defaultBlogPosts.ts'));
function render(name, props, overrides) {
  const module = (overrides ? loader(overrides) : load)(path.join(base, 'src/components/landing', name + '.tsx'));
  return renderToStaticMarkup(React.createElement(module[name], props));
}
function documentOf(html) { return new JSDOM(html).window.document; }
function addTabs(container, buttons, panels, prefix) {
  container.setAttribute('data-ov-tabs', '');
  buttons[0].parentElement.setAttribute('role', 'tablist');
  buttons[0].parentElement.setAttribute('aria-label', prefix === 'ov-role' ? 'Assessment role examples' : 'Dashboard preview');
  buttons.forEach((button, i) => {
    button.id = `${prefix}-tab-${i}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${prefix}-panel-${i}`);
    button.setAttribute('aria-selected', String(i === 0));
    button.setAttribute('data-ov-tab', String(i));
    const panel = panels[i];
    panel.id = `${prefix}-panel-${i}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.setAttribute('data-ov-panel', String(i));
    panel.tabIndex = 0;
    container.appendChild(panel);
  });
}
const entries = [
  ['01-navigation', 'LandingNav', { content: site }],
  ['02-hero', 'HeroSection', { content: home.hero }],
  ['03-trusted-by', 'TrustedBySection', { content: home.trustedBy }],
  ['04-statistics', 'StatsSection', { items: home.stats }],
  ['05-how-it-works', 'HowItWorksSection', { content: home.howItWorks }],
  ['06-assessment-types', 'AssessmentTypesSection', { content: home.assessmentTypes }],
  ['07-features', 'FeaturesSection', { content: home.features }],
  ['08-comparison', 'ComparisonSection', { content: home.comparison }],
  ['09-testimonials', 'TestimonialsSection', { content: home.testimonials }],
  ['10-blog', 'BlogTeaserSection', { content: home.blog, posts: getDefaultBlogList(1, undefined, 3).items }],
  ['11-final-cta', 'FinalCtaSection', { content: home.finalCta }],
  ['12-footer', 'LandingFooter', { content: site }],
];
const fragments = [];
for (const [filename, component, props] of entries) {
  const html = ['TrustedBySection', 'StatsSection'].includes(component)
    ? renderToStaticMarkup(React.createElement(load(path.join(base, 'src/components/landing/SocialProofSections.tsx'))[component], props))
    : render(component, props);
  const doc = documentOf(html);
  // React can emit resource preloads; they are unnecessary in pasteable fragments.
  doc.querySelectorAll('link[rel="preload"]').forEach(el => el.remove());
  if (component === 'LandingNav') {
    const button = doc.querySelector('button');
    const menu = doc.querySelector('header').lastElementChild;
    button.setAttribute('data-ov-menu-toggle', '');
    button.setAttribute('aria-controls', 'ov-mobile-menu');
    button.setAttribute('aria-expanded', 'true');
    button.innerHTML = '<span aria-hidden="true">☰</span>';
    menu.id = 'ov-mobile-menu';
    menu.setAttribute('data-ov-menu', '');
  }
  if (component === 'HeroSection') {
    const buttons = [...doc.querySelectorAll('button')];
    const dashboard = buttons[0].parentElement.parentElement.parentElement;
    const first = dashboard.lastElementChild;
    const panels = [first, ...['integrity', 'summary'].map(tab => documentOf(render('DashboardMockup', {}, { tab })).body.firstElementChild.lastElementChild)];
    addTabs(dashboard, buttons, panels, 'ov-dashboard');
  }
  if (component === 'AssessmentTypesSection') {
    const buttons = [...doc.querySelectorAll('button')];
    const original = buttons[0].parentElement.nextElementSibling;
    const panels = [original, ...['sales', 'developer', 'finance'].map(role => {
      const d = documentOf(render(component, props, { role }));
      return d.querySelector('button').parentElement.nextElementSibling;
    })];
    const container = doc.createElement('div');
    original.before(container);
    container.appendChild(buttons[0].parentElement);
    addTabs(container, buttons, panels, 'ov-role');
  }
  if (component === 'HowItWorksSection') {
    // Native video controls remain usable when WordPress disallows JavaScript.
    doc.querySelector('[aria-label="Play video"]').remove();
    doc.querySelector('video').setAttribute('preload', 'metadata');
  }
  if (component === 'TestimonialsSection') {
    const videos = home.testimonials.quotes.filter(quote => quote.videoUrl?.trim());
    doc.querySelectorAll('button').forEach((button, i) => {
      const a = doc.createElement('a');
      a.className = button.className;
      a.innerHTML = button.innerHTML;
      a.href = videos[i].videoUrl;
      a.setAttribute('aria-label', `Watch video story by ${videos[i].name}`);
      button.replaceWith(a);
    });
  }
  doc.querySelectorAll('[src="/videos/talvyn.mp4"], a[href="/videos/talvyn.mp4"]').forEach(el => el.setAttribute(el.tagName === 'A' ? 'href' : 'src', 'assets/talvyn.mp4'));
  doc.querySelectorAll('a[href^="/#"]').forEach(a => a.setAttribute('href', a.getAttribute('href').slice(1)));
  doc.querySelectorAll('svg.lucide').forEach(svg => svg.setAttribute('aria-hidden', 'true'));
  // Put every fragment in its own CSS scope, so sections can be reordered independently.
  const formatted = doc.body.innerHTML.replace(/></g, '>\n<');
  const fragment = `<!-- ${filename}: edit visible text, href links, and media src values below. -->\n<div class="ov-landing" data-ov-section="${filename}">\n${formatted}\n</div>\n`;
  fs.writeFileSync(path.join(__dirname, 'sections', filename + '.html'), fragment);
  fragments.push(fragment);
}
(async () => {
  const classes = [...new Set(fragments.flatMap(fragment => [...fragment.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/))))];
  // Compile only exported classes, with the project's exact theme and breakpoints.
  const input = `@import "tailwindcss" source(none);\n@config "${base}/tailwind.config.ts";\n@source inline(${JSON.stringify(classes.join(' '))});`;
  const result = await postcss([tailwind({ base, optimize: false })]).process(input, { from: path.join(base, 'wordpress-export.css') });
  const root = result.root;
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    if (rule.selector.includes('&')) return; // Nested selectors inherit their already-scoped parent.
    rule.selectors = rule.selectors.map(selector => {
      if ([':root', ':host', 'html', 'body'].includes(selector)) return '.ov-landing';
      return `.ov-landing ${selector}`;
    });
  });
  // Unlayered CSS avoids ordinary WordPress theme rules outranking every utility.
  root.walkAtRules('layer', rule => rule.nodes ? rule.replaceWith(...rule.nodes) : rule.remove());
  const extra = `
.ov-landing { --font-body: "Inter", system-ui, sans-serif; --font-display: "Plus Jakarta Sans", "Inter", system-ui, sans-serif; font-family: var(--font-body); line-height: 1.5; color: #0f172a; background: white; overflow-wrap: break-word; }
.ov-landing h1, .ov-landing h2, .ov-landing h3, .ov-landing h4 { font-family: var(--font-display); }
.ov-landing .grid > * { min-width: 0; }
.ov-landing [hidden] { display: none !important; }
.ov-landing :focus-visible { outline: 3px solid #0f766e; outline-offset: 4px; }
.ov-landing [data-ov-tab][aria-selected="true"] { background: #0f766e; color: white; }
.ov-landing [data-ov-tab][aria-selected="true"] svg { color: inherit; }
.ov-landing [data-ov-tab][aria-selected="false"] { background: white; color: #475569; box-shadow: none; }
.ov-landing [data-ov-tabs]:not([data-ov-ready]) [role="tablist"] { display: none; }
.ov-landing [data-ov-tabs]:not([data-ov-ready]) [data-ov-panel] { margin-bottom: 2rem; }
@media (max-width: 639px) {
 .ov-landing #testimonials .justify-between { flex-wrap: wrap; }
 .ov-landing #comparison .px-6 { padding-left: .5rem; padding-right: .5rem; }
 .ov-landing [data-ov-tabs] [role="tablist"] { flex-wrap: wrap; }
 .ov-landing #ov-role-panel-0 .justify-between, .ov-landing [id^="ov-role-panel-"] .justify-between { gap: .75rem; flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) { .ov-landing *, .ov-landing *::before, .ov-landing *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
`;
  const css = '/* Compiled project styles, scoped to .ov-landing. No Tailwind runtime required. */\n' + root.toString() + extra;
  fs.writeFileSync(path.join(__dirname, 'landing.css'), css);
  fs.writeFileSync(path.join(__dirname, '00-styles.html'), '<style>\n' + css + '\n</style>\n');
  // Minified copy, for pasting into a plugin/child-theme CSS field with a size limit.
  const { transform } = req('lightningcss');
  fs.writeFileSync(path.join(__dirname, 'landing.min.css'), transform({ filename: 'landing.css', code: Buffer.from(css), minify: true }).code);
  // No <style>/<script>: survives WordPress KSES filtering for users without unfiltered_html.
  fs.writeFileSync(path.join(__dirname, 'wordpress-html-only.html'),
    '<!-- Talvyn landing page - page markup only, no style or script tags.\n     Load landing.min.css and landing.js separately (see README).\n     Replace assets/talvyn.mp4 with your Media Library URL. -->\n' + fragments.join('\n'));
  const js = fs.readFileSync(path.join(__dirname, 'landing.js'), 'utf8');
  fs.writeFileSync(path.join(__dirname, '13-interactions.html'), '<script>\n' + js + '\n</script>\n');
  fs.writeFileSync(path.join(__dirname, 'landing-page.html'), '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Talvyn — Landing page HTML preview</title>\n<link rel="stylesheet" href="landing.css">\n<style>body { margin: 0; }</style>\n</head>\n<body>\n' + fragments.join('\n') + '\n<script src="landing.js"></script>\n</body>\n</html>\n');
  fs.writeFileSync(path.join(__dirname, 'wordpress-paste.html'), '<!-- Paste this entire file into one WordPress Custom HTML block. CSS and JavaScript are included. -->\n<style>\n' + css + '\n</style>\n' + fragments.join('\n') + '\n<script>\n' + js + '\n</script>\n');
  console.log(`Exported ${fragments.length} sections and ${classes.length} CSS classes.`);
})();
