//========================================================
// navigation.novaextension
//
// i'm not a javascript whiz, what follows may break convention
//========================================================

const { NavigationHistoryDataProvider } = require('./NavigationHistoryDataProvider');

var treeView = null;
var dataProvider = null;

exports.activate = function () {
    // Provided by the extension code
    dataProvider = new NavigationHistoryDataProvider();
    
    // Create the TreeView
    treeView = new TreeView("navigation.history.entries", {
        dataProvider: dataProvider
    });
    
    treeView.onDidChangeSelection((selection) => {
        // console.log("New selection: " + selection.map((e) => e.name));
    });
    
    treeView.onDidExpandElement((element) => {
        // console.log("Expanded: " + element.name);
    });
    
    treeView.onDidCollapseElement((element) => {
        // console.log("Collapsed: " + element.name);
    });
    
    treeView.onDidChangeVisibility(() => {
        // console.log("Visibility Changed");
    });
    
    // TreeView implements the Disposable interface
    nova.subscriptions.add(treeView);
};
exports.deactivate = function () {};
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);


console.log("navigation.novaextension init")

debugOptions = {
    logChangeMessages:false,
    logHistory:false,
    logNavigationMessages:false,
    logWaypointReplacements:false, // this is spammy, best left off
}

intervalDurationInMilliseconds = 100
trail = [];
currentIndex = -1
lastActiveTextEditor = null;
navigatingToDifferentFile = false


//========================================================
// configs
//========================================================
// HISTORY SIZE
historySize = nova.config.get("navigation.historySize")
nova.config.onDidChange("navigation.historySize", (newValue, oldValue) => { 
    if (historySize != newValue)
    {
        console.log("historySize changed from " + oldValue + " to " + newValue)
        historySize = newValue   
    }
})

// LOGGING DEBUG MESSAGES
logDebugMessages = nova.config.get("navigation.logDebugMessages")
setLogDebugMessagesEnabled(logDebugMessages, true)
nova.config.onDidChange("navigation.logDebugMessages", (newValue, oldValue) => { 
    setLogDebugMessagesEnabled(newValue, false)
})
function setLogDebugMessagesEnabled(newValue, forceUpdate)
{
    if (logDebugMessages != newValue || forceUpdate)
    {
        console.log("logDebugMessages set to " + newValue)
        logDebugMessages = newValue
        debugOptions.logChangeMessages = newValue
        debugOptions.logHistory = newValue
        debugOptions.logNavigationMessages = newValue
    }
}


//========================================================
// commands
//========================================================
nova.commands.register("navigation.forwardOneWaypoint", (editor) => { navigateForward_Waypoint() });
nova.commands.register("navigation.backOneWaypoint", (editor) => { navigateBackward_Waypoint() });
nova.commands.register("navigation.forwardOneFile", (editor) => { navigateForward_File() });
nova.commands.register("navigation.backOneFile", (editor) => { navigateBackward_File() });
nova.commands.register("navigation.jumpTo", (_) => {
  
    selectedWaypoint = treeView.selection[0]
    previousWaypoint = trail[currentIndex]
    currentIndex = trail.indexOf(selectedWaypoint)
    
    dataProvider.setCurrentIndex(currentIndex)
    treeView.reload()
    newWaypoint = trail[currentIndex]
    navigatingToDifferentFile = previousWaypoint.path != newWaypoint.path
    openWaypoint(trail[currentIndex])
});


//========================================================
// main loop
// the heart of this is a simple and relatively fast interval that watches for changes in the active file, and cursor changes.
//========================================================
setInterval(function () {
    //console.log("autoTrails interval")
    if (nova.workspace.activeTextEditor != null) 
    {
        if (lastActiveTextEditor != nova.workspace.activeTextEditor) 
        {
            lastActiveTextEditor = nova.workspace.activeTextEditor;
            
            if (navigatingToDifferentFile)
            {
                navigatingToDifferentFile = false
            }
            else
            {
                if (debugOptions.logChangeMessages)
                {
                    console.log("new text editor, pushing waypoint...")  
                }
                
                push(waypoint(lastActiveTextEditor))
            }
        }
        else
        {
            checkCurrentFile()
        }
    }
}, intervalDurationInMilliseconds);

function checkCurrentFile()
{
    // if we moved within the file, replace the last waypoint
    newWaypoint = waypoint(lastActiveTextEditor)
    currentWaypoint = trail[currentIndex]
    
    // if we're in different files, make a new waypoint (i don't believe this should happen)
    if (newWaypoint.path != currentWaypoint.path)
    {
        if (debugOptions.logChangeMessages)
        {
            console.log("new file path, pushing waypoint...")
        }
        push(newWaypoint)
        return
    }
    
    // we're in the same file.
    // how far did the cursor move within this file?
    lineDiff = Math.abs(newWaypoint.line - currentWaypoint.line)
    columnDiff = Math.abs(newWaypoint.column - currentWaypoint.column)

    // if we're 2+ units away, make a new waypoint
    // disregard column diff here, on purpose, it creates too many entries if you're typing fast, and this isn't what rider does.
    if (lineDiff > 1/* || columnDiff > 1*/)
    {
        
        var activeSelectionRange = newWaypoint.selectionStart - newWaypoint.selectionEnd
        if (activeSelectionRange == 0)
        {
            if (debugOptions.logChangeMessages)
            {
                console.log("2+ units away, pushing waypoint...")
            }
            push(newWaypoint)    
        }
        else 
        {
            if (debugOptions.logWaypointReplacements)
            {
                console.log("1 unit away, replacing waypoint...")    
            }
            replaceLastWaypointWith(newWaypoint)
        }
        
        return
    }
    // if we're 1 unit away, replace the last waypoint.
    else if (lineDiff == 1 || columnDiff == 1)
    {
        if (debugOptions.logWaypointReplacements)
        {
            console.log("1 unit away, replacing waypoint...")    
        }
        replaceLastWaypointWith(newWaypoint)
        return
    }
}

//========================================================
// helpers
//========================================================
function navigateForward_Waypoint()
{
    //console.log("navigateForward_Waypoint")
    
    var newIndex = currentIndex
    if (trail.length > 0 && newIndex < trail.length - 1)
    {
        newIndex++
        clamp(newIndex, 0, trail.length - 1)
    }
    
    if (currentIndex == newIndex)
    {
        // no change
        return
    }
    
    currentIndex = newIndex
    dataProvider.setCurrentIndex(currentIndex)
    treeView.reload()
    
    if (currentIndex >= 0 && currentIndex < trail.length)
    {
        if (debugOptions.logNavigationMessages)
        {
            console.log("nav forward, opening waypoint " + currentIndex + "/" + trail.length)
        }
        
        // hack - if we're going back to a different file, flip our goingBackToDifferentFile flag 
        // normally our interval is going to see we've switched text editors and it will push a new waypoint
        // which we don't want to do when navigating backward.
        if (trail[currentIndex - 1].path != trail[currentIndex].path)
        {
            navigatingToDifferentFile = true
        }
        
        openWaypoint(trail[currentIndex])
    }
    
    logNavigationMessage("forward")
}

function navigateBackward_Waypoint()
{
    //console.log("navigateBackward_Waypoint")

    var newIndex = currentIndex
    
    if (trail.length > 1 && newIndex > 0)
    {
        newIndex--
        clamp(newIndex, 0, trail.length - 1)
    }
    
    if (currentIndex == newIndex)
    {
        // no change
        return
    }
    
    currentIndex = newIndex
    dataProvider.setCurrentIndex(currentIndex)
    treeView.reload()
    
    if (currentIndex >= 0 && currentIndex < trail.length)
    {
        if (debugOptions.logNavigationMessages)
        {
            console.log("nav backward, opening waypoint " + currentIndex + "/" + trail.length)
        }
        
        // hack - if we're going back to a different file, flip our goingBackToDifferentFile flag 
        // normally our interval is going to see we've switched text editors and it will push a new waypoint
        // which we don't want to do when navigating backward.
        if (trail[currentIndex + 1].path != trail[currentIndex].path)
        {
            navigatingToDifferentFile = true
        }
        
        openWaypoint(trail[currentIndex])
    }
    
    logNavigationMessage("back")
}

function navigateForward_File()
{
    //console.log("navigateForward_File")
    
    if (trail.length == 0 || currentIndex < 0 || currentIndex >= trail.length)
    {
        return;
    }
    
    var currentWaypoint = trail[currentIndex]    
    for (var i = currentIndex + 1; i < trail.length; i++)
    {
        var waypoint = trail[i]
        if (waypoint.path != currentWaypoint.path)
        {
            navigatingToDifferentFile = true
            currentIndex = i
            dataProvider.setCurrentIndex(currentIndex)
            treeView.reload()
            
            if (debugOptions.logNavigationMessages)
            {
                console.log("nav forward 1 file, opening waypoint " + currentIndex + "/" + trail.length)
            }
            
            openWaypoint(waypoint)
            logNavigationMessage("forward 1 file")
            return
        }
    }
}

function navigateBackward_File()
{
    //console.log("navigateBackward_File")
    
    if (trail.length == 0 || currentIndex < 0 || currentIndex >= trail.length)
    {
        return;
    }
    
    var currentWaypoint = trail[currentIndex]    
    for (var i = currentIndex - 1; i >= 0; i--)
    {
        var waypoint = trail[i]
        if (waypoint.path != currentWaypoint.path)
        {
            navigatingToDifferentFile = true
            currentIndex = i
            dataProvider.setCurrentIndex(currentIndex)
            treeView.reload()
            
            if (debugOptions.logNavigationMessages)
            {
                console.log("nav backward 1 file, opening waypoint " + currentIndex + "/" + trail.length)
            }
            
            openWaypoint(waypoint)
            logNavigationMessage("back 1 file")
            return
        }
    }
}

function openWaypoint(waypoint) 
{
    if (waypoint) 
    {
        nova.workspace.openFile(waypoint.path, 
        {
            line: waypoint.line,
            column: waypoint.column,
        });
    }
}

function push(waypoint) 
{
    if (currentIndex < trail.length - 1)
    {
        // if we're not at the end of the trail, hack off the end.
        trail.splice(currentIndex + 1)
    }
    
    trail.push(waypoint);
    currentIndex = trail.length - 1// pushing should always put as at the end of the trail
    
    dataProvider.setWaypoints(trail)
    dataProvider.setCurrentIndex(currentIndex)
    treeView.reload()
    
    if (trail.length > historySize)
    {
        var amountToRemove = trail.length - historySize
        trail.splice(0, amountToRemove)
        
        // slide our index over, and clamp to stay in bounds.  i think this is all that's needed?
        currentIndex -= amountToRemove 
        currentIndex = clamp(currentIndex, 0, trail.length - 1)
        dataProvider.setCurrentIndex(currentIndex)
        treeView.reload()
    }
    
    
    logTrailMessage("pushed", waypoint)
}

function replaceLastWaypointWith(newWaypoint)
{
    trail[trail.length - 1] = newWaypoint
    dataProvider.setWaypoints(trail)
    treeView.reload()
    
    if (debugOptions.logWaypointReplacements)
    {
        logTrailMessage("replaced", newWaypoint)
    }
}

function relativePath(path) 
{
    return nova.workspace.relativizePath(path);
}

function trailChoices(trail) 
{
    return trail.map((waypoint) => `${relativePath(waypoint.path)} (line ${waypoint.line}, col ${waypoint.column})`);
}

function waypoint(editor) 
{
    const text = editor.document.getTextInRange(
        new Range(0, editor.document.length)
    );
    const selectionStart = editor.selectedRange.start
    const selectionEnd = editor.selectedRange.end
    const cursorPosition = selectionStart;
    const lines = text.slice(0, cursorPosition).split("\n");
    const line = lines.length;
    const column = lines.slice(-1)[0].length + 1;
    const path = editor.document.path;
    
    return { 
        path: path,
        filename: nova.path.basename(path),
        line: line, 
        column: column,
        selectionStart: selectionStart, 
        selectionEnd: selectionEnd 
    };
}

function goToJump(jumpIndex, dataProvider, treeView) {
      console.log("goToJump")
  }


//========================================================
// logging
//========================================================
function logTrailMessage(message, waypoint)
{
    //console.log("waypoint " + message + "! #" + trail.length + " loc:(" + currentIndex + "/" + trail.length + ") line:" + waypoint.line + " " + waypoint.path);
    
    logHistory()
}

function logNavigationMessage(message)
{
    //console.log("Navigate " + message + "! loc:(" + currentIndex + "/" + trail.length + ")")
    
    logHistory()
}

function logHistory()
{
    if (!debugOptions.logHistory)
    {
        return
    }
    
    for ( var i = 0; i < trail.length; i++)
    {
        var waypoint = trail[i]
        var navChar = "  "
        if (i == currentIndex){ navChar = "=>" }
            
        console.log("    " + navChar + " " + i + "/" + trail.length + "- " + waypoint.line + " " + waypoint.path)
    }
}
