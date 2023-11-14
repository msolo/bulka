type EventCallback = (this: GlobalEventHandlers, event: MouseEvent) => any

class CustomButton extends HTMLElement {
  _onclick: EventCallback | null = null;

  constructor() {
    super();
  }

  connectedCallback() {
    this._onclick = this.onclick;
    this.onclick = CustomButton.clickButton;
    this.onpointerdown = CustomButton.setButtonActive;
    this.onpointerup = CustomButton.clearButtonActive;
    this.onpointerleave = CustomButton.clearButtonActive;
  }

  // disconnectedCallback() {
  //   console.log("Custom element removed from page.");
  // }

  static clickTimers: number[] = []

  // For some reason, button:active pseudo-classes don't work
  // correctly by default and the button highlight is either
  // nonexistent or too sticky on touch events.
  static setButtonActive(event: PointerEvent) {
    // Allow some time to determine if this event is part of a click
    // or a scroll. Don't want to highlight on a scroll unnecessarily.
    let button = <CustomButton>event.target;
    let timerId = setTimeout(() => {
      button.classList.add('active');
    }, 250);
    CustomButton.clickTimers.push(timerId);
  }

  static clearButtonActive(event: PointerEvent) {
    for (let t of CustomButton.clickTimers) {
      clearTimeout(t);
    }
    CustomButton.clickTimers = [];
    (<CustomButton>event.target).classList.remove('active');
  }

  static clickButton(event: MouseEvent) {
    // Flash the button highlight momentarily before completing event.
    let button = <CustomButton>event.target;
    button.classList.add('active');
    setTimeout(() => {
      if (button._onclick) {
        button._onclick(event);
      }
    }, 100);
  }
}

customElements.define("custom-button", CustomButton);


class MenuHandler {
  mute(e: HTMLElement) {
    e.classList.add('pulldown-menu-mute-events');
  }

  unmute(e: HTMLElement) {
    e.classList.remove('pulldown-menu-mute-events');
  }

  showMenu(id: string) {
    // Disable pointer events for any controls outside the menu.
    this.mute(document.querySelector('main')!);
    this.mute(document.querySelector('nav')!);

    // For some reason, no amount of CSS inheritance is equivalent
    // to setting the property directly on the element.
    //
    // This feels like a Safari 17 bug, but that's our platform, so
    // we work around.
    for (let e of document.querySelectorAll("main button")) {
      this.mute(<HTMLElement>e);
    }

    document.querySelector("#" + id)!.classList.toggle("visible");
  }

  onclick(event: MouseEvent) {
    if ((<Element>event.target).matches("menu > button")) {
      // Ignore click on the menu button.
      return
    }

    let dropdowns = document.querySelectorAll(".pulldown-menu");
    for (let e of dropdowns) {
      e.classList.remove("visible");
    }

    let muted = document.querySelectorAll(".pulldown-menu-mute-events");
    for (let e of muted) {
      this.unmute(<HTMLElement>e);
    }
  }
}

var menuHandler = new MenuHandler();
window.addEventListener('click', (event) => {
  menuHandler.onclick(event);
});
