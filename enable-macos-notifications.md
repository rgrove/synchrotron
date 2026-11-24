# Enable macOS Notifications

Synchrotron's `--notify` option uses a small helper app, `terminal-notifier.app`, to show notifications on macOS. macOS only asks for permission to show notifications when an app is launched like a normal app, and Synchrotron runs the helper directly from inside a `node_modules` directory, so macOS never asks. Follow these steps once per computer to register the helper with macOS and allow its notifications.

## 1. Find the helper app

The easiest way is to copy the path from Synchrotron's warning message. If you don't have the message handy, the app is in one of these places, depending on how you installed Synchrotron:

-   **Local install** (`npm i @rgrove/synchrotron` in a project): `node_modules/node-notifier/vendor/mac.noindex/terminal-notifier.app` inside your project directory.

-   **Global install** (`npm i -g @rgrove/synchrotron`): run `npm root -g` to print your global `node_modules` directory, then look in `@rgrove/synchrotron/node_modules/node-notifier/vendor/mac.noindex/terminal-notifier.app` inside it.

-   **`npx` or `pnpm`**: these keep their packages in a cache directory with a generated name. You can search the cache for the app. For example, this lists every copy in the `npx` cache:

    ```
    find ~/.npm/_npx -name terminal-notifier.app -prune
    ```

Save the path in a shell variable so the next commands can use it. Replace the path below with yours, and keep the quotes:

```
APP="/path/to/node_modules/node-notifier/vendor/mac.noindex/terminal-notifier.app"
```

## 2. Tell macOS the app exists

`lsregister` is a tool built into macOS that manages the database macOS uses to keep track of installed apps. The `-f` flag tells it to add the app at the given path to that database, even though it's inside a `node_modules` directory. This doesn't move, copy, or change the app, and it doesn't grant any permissions by itself.

```
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
```

The command doesn't print anything when it works.

## 3. Launch the app once

The `open` command launches the app the same way double-clicking it in Finder would, which is what makes macOS ask for permission. Everything after `--args` is passed to the app, which here tells it to post a test notification titled "test" with the text "hello":

```
open "$APP" --args -title test -message hello
```

## 4. Allow notifications

After the previous step, macOS should ask whether terminal-notifier may send notifications, either in a dialog or in a notification with an **Allow** button or an **Options** menu. Choose **Allow**.

If you don't see a prompt, open **System Settings** › **Notifications**, find **terminal-notifier** in the list of apps, and turn on **Allow notifications**. Choosing **Banners** or **Alerts** as the style makes the notifications visible on screen.

Then run Synchrotron with `--notify` again. The warning should be gone and notifications should appear.

If notifications still don't appear, check whether a Focus mode such as **Do Not Disturb** is on (look in **Control Center** or **System Settings** › **Focus**). A Focus mode hides notifications from apps it doesn't allow.

## Undoing it

To stop the notifications, open **System Settings** › **Notifications** › **terminal-notifier** and turn off **Allow notifications**.

To remove the app from macOS's app database, run `lsregister` with the `-u` (unregister) flag:

```
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$APP"
```

The app itself goes away when you uninstall Synchrotron or delete the `node_modules` directory it's in.
