**Navigation** is an extension for the Nova IDE. It enables hotkeys for navigating backward and forward through your code!

## Details

This was designed to emulate the Navigate>Back/Forward functionality you'd typically see in other IDEs.

Some care has been taken to ensure this works alright in Split views, but as of now it's not well battle-tested.

| Menu Item              | Binding         |                        |
| ---------------------- | --------------- | ---------------------- |
| **Navigate Backward**  | `Shift-⌘--`     | "Shift+Command+Minus"  |
| **Navigate Forward**   | `Shift-⌘-=`     | "Shift+Command+Equals" |


This was heavily inspired by https://github.com/eahanson/trail.novaextension but it required a lot elbow grease to get it working nicely.

This extension is making some guesses whether you've opened a file, or moved your cursor in a 100ms loop.  Feedback is appreciated :)  