import { PresetDeck, t } from "./types";

export const frontend: PresetDeck = {
  deck: "Frontend",
  slug: "frontend",
  terms: [
    t(
      "Virtual DOM",
      "An in-memory description of the UI that React compares between renders to work out the minimal real DOM changes.",
      "Updating the real DOM is relatively expensive, so React renders components into a lightweight tree, diffs it with the previous tree (reconciliation), and applies only the differences.",
      "Re-rendering a component doesn't mean touching the DOM: React diffs the virtual DOM and only patches the text node that changed.",
      ["In-memory tree describing the UI", "Diffed between renders", "Only the differences reach the real DOM"],
      "Shadow DOM: browser encapsulation for web components, unrelated to React's diffing.",
      "What actually happens when a React component re-renders?"
    ),
    t(
      "Reconciliation",
      "React's process of comparing the new element tree with the previous one to decide what to update.",
      "React compares elements by type and key. Same type means update in place; a different type means unmount and remount. Stable keys in lists let React match items correctly when they move.",
      "Using array indexes as keys broke reconciliation when we reordered the list, so inputs kept the wrong values until we switched to stable ids.",
      ["Diffs new and old trees", "Compares by element type and key", "Stable keys matter for lists"],
      null,
      "Why does React warn you about keys in lists, and what goes wrong without stable keys?"
    ),
    t(
      "Memoization",
      "Caching the result of a computation so it isn't recalculated when the inputs haven't changed.",
      "In React, useMemo caches a computed value, useCallback caches a function identity, and React.memo skips re-rendering a component when its props are equal. It helps only when the work or the re-renders are actually expensive.",
      "The chart re-rendered on every keystroke, so we wrapped it in React.memo and memoised its data with useMemo.",
      ["Reuse results when inputs are unchanged", "useMemo, useCallback, React.memo", "Only worth it for expensive work"],
      null,
      "A page becomes laggy when typing into a search box. How would you find and fix the cause?"
    ),
    t(
      "Hydration",
      "Attaching React's event handlers and state to HTML that was already rendered on the server.",
      "With server-side rendering, the browser shows HTML immediately, then React runs on the client and hydrates it, making it interactive. If the client render doesn't match the server HTML, you get hydration mismatch errors.",
      "We got hydration mismatches because the server and browser formatted dates in different time zones.",
      ["Makes server-rendered HTML interactive", "Client render must match server HTML", "Mismatches cause warnings and re-renders"],
      null,
      "Why might a server-rendered page look right but not respond to clicks for a moment?"
    ),
    t(
      "Server-side rendering (SSR)",
      "Generating a page's HTML on the server for each request instead of only in the browser.",
      "SSR gives faster first paint and better SEO because content arrives as HTML. The trade-offs are server cost, time to first byte and hydration. Static generation renders at build time instead.",
      "We server-render product pages for SEO and fast first paint, but the account dashboard is client-rendered because it's behind login.",
      ["HTML generated on the server per request", "Faster first paint and better SEO", "Costs server time and needs hydration"],
      "Static site generation: renders at build time, not per request.",
      "When would you render a page on the server rather than in the browser?"
    ),
    t(
      "Debouncing",
      "Waiting until an event has stopped firing for a set time before running the handler.",
      "Debouncing collapses a burst of events, like keystrokes, into one call after the user pauses. It's ideal for search-as-you-type and autosave.",
      "We debounce the search input by 300 milliseconds so we send one request when the user pauses, not one per keystroke.",
      ["Runs after events stop for a while", "Collapses bursts into one call", "Good for search inputs and autosave"],
      "Throttling: runs at most once per interval during a burst.",
      "A search box sends a request on every keystroke and overloads the API. How would you fix it?"
    ),
    t(
      "Throttling",
      "Limiting a function to run at most once in a given time interval, however often it's triggered.",
      "Throttling keeps regular updates during continuous events like scrolling or resizing, without running on every single event.",
      "The scroll handler is throttled to once every 100 milliseconds, which keeps the progress bar smooth without janking the page.",
      ["At most once per interval", "Keeps updating during continuous events", "Good for scroll and resize handlers"],
      "Debouncing: waits until the events stop before running once.",
      "A scroll listener is making the page janky. What would you do?"
    ),
    t(
      "Event delegation",
      "Handling events for many child elements with one listener on a common parent.",
      "Events bubble up the DOM, so one listener on a parent can check event.target to see which child was clicked. It saves memory and works for children added later.",
      "Instead of a click listener on each of 1,000 rows, we use event delegation with a single listener on the table.",
      ["One listener on a parent", "Relies on event bubbling", "Works for dynamically added children"],
      null,
      "How would you handle clicks on thousands of list items efficiently?"
    ),
    t(
      "Critical rendering path",
      "The steps the browser takes to turn HTML, CSS and JavaScript into pixels on screen.",
      "The browser builds the DOM and CSSOM, combines them into a render tree, calculates layout and paints. Render-blocking CSS and synchronous scripts delay first paint, so you inline critical CSS and defer scripts.",
      "Our first paint was slow because a large stylesheet and a synchronous script blocked the critical rendering path, so we deferred the script.",
      ["DOM + CSSOM to render tree, layout, paint", "Blocking CSS and scripts delay first paint", "Optimised by deferring and inlining critical CSS"],
      null,
      "Your page shows a blank screen for two seconds on mobile. How would you investigate?"
    ),
    t(
      "Core Web Vitals",
      "Google's user-centred page metrics: Largest Contentful Paint, Interaction to Next Paint and Cumulative Layout Shift.",
      "LCP measures loading of the main content, INP measures how quickly the page responds to interactions, and CLS measures unexpected layout shifts. They're measured from real users and affect search ranking.",
      "Our CLS was poor because images had no dimensions, so we added width and height attributes and the layout stopped jumping.",
      ["LCP: main content loading", "INP: responsiveness to interactions", "CLS: visual stability"],
      null,
      "How would you measure and improve how fast your site feels to real users?"
    ),
    t(
      "Code splitting",
      "Breaking a JavaScript bundle into smaller chunks that load only when needed.",
      "Instead of shipping the whole app up front, routes and heavy components load on demand with dynamic import and React.lazy. It cuts initial load time at the cost of a small delay when a chunk is first needed.",
      "The code editor is a separate chunk loaded with React.lazy, so the home page doesn't download it.",
      ["Splits the bundle into chunks", "Loads code on demand", "Dynamic import, React.lazy"],
      "Tree shaking: removes unused code from a bundle, rather than splitting it.",
      "Your app's initial JavaScript bundle is 3 MB. What would you do?"
    ),
    t(
      "Tree shaking",
      "Removing code that's never used from the final bundle during the build.",
      "Bundlers analyse ES module imports and exports and drop unused exports. It works best with ES modules and side-effect-free packages.",
      "Switching to the ES module build of the library let tree shaking drop the parts we didn't import, saving 80 KB.",
      ["Drops unused exports at build time", "Relies on ES module static imports", "Side effects can prevent it"],
      "Code splitting: loads code later; tree shaking removes it entirely.",
      "How would you reduce bundle size when you only use a few functions from a large library?"
    ),
    t(
      "Accessibility tree",
      "The browser's representation of the page that screen readers and other assistive technologies read.",
      "It's built from the DOM using roles, names and states. Semantic HTML fills it in automatically; ARIA attributes adjust it when native elements can't. If something isn't in the accessibility tree correctly, assistive tech users can't use it.",
      "A div with an onClick handler had no role or name in the accessibility tree, so we replaced it with a real button.",
      ["What assistive technology reads", "Built from roles, names and states", "Semantic HTML first, ARIA when needed"],
      null,
      "How would you make sure a custom dropdown works for screen reader users?"
    ),
    t(
      "Semantic HTML",
      "Using HTML elements for their meaning, like button, nav and h1, instead of generic divs.",
      "Semantic elements give you keyboard support, accessibility roles, better SEO and readable markup for free. Headings in order and landmarks help screen reader users navigate.",
      "Replacing clickable divs with buttons fixed keyboard access without any extra JavaScript.",
      ["Elements chosen for meaning", "Free keyboard and accessibility support", "Landmarks and heading order aid navigation"],
      null,
      "What would you look for first when auditing a page's accessibility?"
    ),
    t(
      "CORS",
      "A browser rule that controls whether a page from one origin can read responses from another origin.",
      "By default browsers block cross-origin reads. The server opts in with Access-Control-Allow-Origin headers, and non-simple requests trigger a preflight OPTIONS request. With cookies, the server must also allow credentials and name the exact origin.",
      "Our frontend and API were on different domains, so cookies failed under CORS rules until we proxied API calls through the frontend's own domain.",
      ["Browser-enforced cross-origin policy", "Server opts in with response headers", "Preflight for non-simple requests; credentials need care"],
      "CSRF: an attack using a user's cookies; CORS is a browser read policy.",
      "Your frontend gets a CORS error calling your own API. What's happening and how do you fix it?"
    ),
    t(
      "Content Security Policy (CSP)",
      "A response header that tells the browser which sources of scripts, styles and connections a page may use.",
      "CSP limits the damage of cross-site scripting by blocking inline scripts and unknown origins. You list allowed sources per directive, like script-src and connect-src.",
      "Our CSP only allows scripts from our own origin and the Google sign-in domain, so an injected script tag from elsewhere won't run.",
      ["Header listing allowed sources", "Mitigates cross-site scripting", "Directives like script-src, connect-src"],
      null,
      "How would you limit the damage if an attacker managed to inject HTML into your page?"
    ),
    t(
      "State management",
      "How an app stores, updates and shares data between components.",
      "Local state lives in a component; shared client state may use context or a store like Redux or Zustand; server state (data from APIs) is often better handled by a data-fetching cache. Choosing the right place avoids prop drilling and stale data.",
      "Most of our 'global state' was really server data, so we moved it to a query cache and kept only UI state in the store.",
      ["Local vs shared vs server state", "Context, Redux, Zustand, query caches", "Put state where it's used"],
      null,
      "How would you decide where a piece of state should live in a React app?"
    ),
    t(
      "Prop drilling",
      "Passing props through several layers of components that don't use them, just to reach a deep child.",
      "It makes components tightly coupled and refactors painful. Alternatives are composition (passing children), context, or a state store.",
      "We were prop drilling the user object through five components, so we provided it with context instead.",
      ["Props passed through components that don't need them", "Couples intermediate components", "Fix with composition, context or a store"],
      null,
      "A deeply nested component needs data from the top of the tree. How would you get it there?"
    ),
  ],
};
