# Goals

This needed to work on my current hardware: mediocre iPhone, iPad and generic browser. I wasn't going to pay $100 for the privilege of running my own code on my own phone so that necessitated doing a cosmetically decent web app.

The files need to be human readable - if I put this project in the ground, I want to salvage value from my notes and formulas.

This became a technology exploration - taking stock of the state-of-the-art in available browsers and related technologies.

At first, fully offline mode was a goal, but given some of the issues with Safari and progressive web apps, I relaxed this requirement somewhat. It works without the internet since the storage server is on my home network.

# Application Code Structure

The app is simply a viewer/editor for a collection of Markdown recipes (`.mdr`) files. It has a small amount of logic to aid in scheduling and scaling recipes as well as tinkering with fermentation techniques which is crucial when researching new breads.

All files are loaded from an HTTP file system on startup. They are saved back as changes are made and edits are generally assumed to be single-user (too many cooks, never a good thing).

The app is structured has 3 main components:

`recipe.ts` handles parsing of the `.mdr` files and creating a data model.

`bulka.ts` is the controller that bridges the browser initialization, data models and template rendering.

`ui.ts` is a collection of code needed to fix UI behaviors that are broken/non-function in the browser, particularly when interacting with touch screens. This code targets Safari on iOS 17, but works on most sane desktop browsers.

## UI Strategy

The UI is basically HTML/CSS with sparing Javascript.  A single HTML file drives the entire UI and various chunks are internally structured as text templates which are processed in a Javascript version of `handlebars`. This feels like 1999, but it is simple to debug and seems to perform very well. The templates are rendered by setting `innerHTML` - it's pretty darn analagous to CGI and `<frameset>` in Netscape 4.

The CSS controls most of the layout and gives this an "approximate iOS" feel. A few interactions need Javascript to actually function correctly. Most of this feels more like fixing browser quirks than adding new functionality.

There is a global controller object that the HTML elements call to handle events and bridge into the Typescript code. There is sparing async loading because everything is designed to be as minimal as possible.

The UI is carved up into tabs and navigation and manually refreshed. The Safari browser seems amazing at doing minimal repainting, even in the face of large textual updates to the DOM. I did not expect this and it's very impressive. It means this naive approach of page rendering produces excellent results with minimal code and complexity on the application side.

### Mildly Clever

The only mildly clever part of the UI is using `CustomeElement` to define Javascript handlers to correct behaviors on the default `<button>` class. This could all be handled with text templates, but it felt cleaner to do this by registering a `CustomButton` element type. The means there are non-standard HTML tags, but I actually think it's a decent pattern.

## Data Storage

A side effect of using browser tech is that there isn't a nice story around storage. I like filesystems and mobile phones tend to disappoint here. Also, I tend to use more than one device, or share read-only versions of my recipes with others, thus there is a small server side component to implement an HTTP server that can GET/PUT files and handle a directory listing.

# Caveats

  * The data for this application all fits in memory, so no efforts to be clever or efficient are made.
  * Safari is the target. It seems to work on Chrome. I'm sure it looks awful on an Android phone, not that I've looked.
  * The editing is not WYSIWYG. That's a different kettle of fish to fry.
  * I cannot pretend to undestand how best to do modules in Javascript/Typescript. I spent some time and ended up declaring bankruptcy.

# Surprises
 * Great minimal repainting behavior on Safari - big changes to `innerHTML` end up painting deltas and feel instant.
 * CSS behavior with touch events is still incredibly quirky.

# The Server Side of Things

I develop this using a tiny python web server. This lets me disable caching on all files so I don't have deal with stale-on-reload issues and easily implement write functionality like `PUT`. This server typically receives 10 requests a week; scalability is not a concern.

# TODOs

 - [ ] TODO: It should be possible to clone a recipe or do "save as".
 - [ ] TODO: Automatic file names for recipes are not helpful - it's database in filesystem, not actually useful to a human.
 - [ ] TODO: watch out for clobbering with stale app data.
 - [ ] TODO: parse errors either need to be reverted, or discussed somehow - right now they show up as save failure, which isn't true and leaves the data model inconsistent.
 - [ ] TODO: Use WebDAV instead of cobbled `GET/PUT` - advisory locking would be nice, but `PUT` with `if-unmodified-since` (essentially a conditional `PUT`, almost a CAS) would probably be much simpler.
 - [ ] TODO: Allow offline mode - save data to localStorage and upload when you are back online. Sweet fancy Moses, this would be the thing, but it invites conflicts which begats a lot of additional complexity.
 - [ ] TODO: Make sure recipe files are invalidated often enough. Is this a web server issue or a client issue?
 - [ ] TODO: Better About
 - [ ] TODO: Better installation.
 - [ ] TODO: Add clone
 - [ ] TODO: Add delete
 - [ ] TODO: Log a schedule? Log temps to some sort of addenda file?
 - [ ] TODO: The schedule infers lengths of steps, but some things things need to run concurrently - like preheating an oven - that doesn't get expressed in the current notation.

## Versioned Resources with Infinite Expiration
Could put versioned resources like so:

`host/app-name/vXXX/{lib,img,js}` - only the app itself needs to redirect from `host/app-name -> host/app-name/vXXX`

The bigger issue is whether Safari handles caching and offline file access.

# Mobile Safari Quirks

If you try to disable `overscroll` in any way, link/button tracking - which was already a bit odd on iOS - really gets screwed up. You can't move your touch off a button without having it fire the event anyway. Visual feedback is incredibly limited and usually wrong/misleading. This is really poor quality experience.

This issue is exacerbated by disabling text selection with `-webkit-user-select: none;`.

One might be tempted to just leave the bounce effect turned on.

If you turn it off, all `<a>` and `<button>` (possibly others) need a piece of code to disable the default events:
```
document.addEventListener(
  'touchmove',
  function(e) {
    e.preventDefault();
  },
  false
);
```

This should be the default obviously, but the behavior is still far from ideal. Somehow, there is no visual tracking of the button by default. It's very disappointing that CSS is not enough and that the default behaviors are so far from ideal, but the amount of Javascript to fix this is actually fairly small. See `CustomButton` for more details.
