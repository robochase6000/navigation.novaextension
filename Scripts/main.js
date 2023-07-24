//========================================================
// navigation.novaextension
//
// i'm not a javascript whiz, what follows may break convention
//========================================================

const { NavigationHistoryDataProvider } = require('./NavigationHistoryDataProvider');
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

var treeView = null;
var dataProvider = null;

var debugOptions = {
    logChangeMessages:false,
    logHistory:false,
    logNavigationMessages:false,
    logWaypointReplacements:false, // this is spammy, best left off
}

var intervalDurationInMilliseconds = 100
var trail = [];
var currentIndex = -1
var lastActiveTextEditor = null;
var navigatingToDifferentFile = false

exports.activate = function () {
    // Provided by the extension code
    dataProvider = new NavigationHistoryDataProvider();
    
    // Create the TreeView
    treeView = new TreeView("navigation.history.entries", {
        dataProvider: dataProvider
    });
   
    // TreeView implements the Disposable interface
    nova.subscriptions.add(treeView);
};
exports.deactivate = function () {};

console.log("navigation.novaextension init")


//========================================================
// history size
//========================================================
var historySize = nova.config.get("navigation.historySize")
nova.config.onDidChange("navigation.historySize", (newValue, oldValue) => { 
    if (historySize != newValue)
    {
        console.log("historySize changed from " + oldValue + " to " + newValue)
        historySize = newValue   
    }
})


//========================================================
// LOGGING DEBUG MESSAGES
//========================================================
var logDebugMessages = nova.config.get("navigation.logDebugMessages")
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
// NEW ENTRY DISTANCE
//========================================================
var newEntryDistanceInLines = nova.config.get("navigation.newEntryDistanceInLines")
nova.config.onDidChange("navigation.newEntryDistanceInLines", (newValue, oldValue) => {
    newEntryDistanceInLines = newValue
})


//========================================================
// SIDEBAR ENABLED
//========================================================
var sidebarEnabled = nova.config.get("navigation.sidebarEnabled")
nova.config.onDidChange("navigation.sidebarEnabled", (newValue, oldValue) => {
    sidebarEnabled = newValue
})


//========================================================
// AUTO-REVEAL FOCUSED INDEX
//========================================================
var autoRevealFocusedIndex = nova.config.get("navigation.autoRevealFocusedIndex")
nova.config.onDidChange("navigation.autoRevealFocusedIndex", (newValue, oldValue) => {
    autoRevealFocusedIndex = newValue
})


//========================================================
// commands
//========================================================
nova.commands.register("navigation.forwardOneWaypoint", (editor) => { navigateForward_Waypoint() });
nova.commands.register("navigation.backOneWaypoint", (editor) => { navigateBackward_Waypoint() });
nova.commands.register("navigation.forwardOneFile", (editor) => { navigateForward_File() });
nova.commands.register("navigation.backOneFile", (editor) => { navigateBackward_File() });
nova.commands.register("navigation.navigateToSelection", (_) => { navigateToSelection() });


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
                var newWaypoint = createWaypoint(lastActiveTextEditor)
                if (newWaypoint != null)
                {
                    if (debugOptions.logChangeMessages)
                    {
                        console.log("new text editor, pushing waypoint...")  
                    }
                    
                    push(newWaypoint)
                }
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
    const newWaypoint = createWaypoint(lastActiveTextEditor)
    if (newWaypoint == null)
    {
        return
    }
    
    var currentWaypoint = trail[currentIndex]
    if (currentWaypoint == null)
    {
        // up to this point in the execution, it's assumed that the TextEditor you're working with already had a saved file in it, and hence should have at least one valid waypoint already
        // but if you've made a new TextEditor to make a New File, there isn't actually a valid waypoint yet.
        // a better fix would probably be to listen for TextEditor.onDidSave, but i don't want to mess with disposables and callbacks yet when a simple fix can get the job done.
        // the fix: if we have an active text editor here, simply push a new waypoint and try again.
        if (nova.workspace.activeTextEditor != null) 
        {
            lastActiveTextEditor = nova.workspace.activeTextEditor;
            currentWaypoint = createWaypoint(lastActiveTextEditor)
            if (currentWaypoint != null)
            {
                if (debugOptions.logChangeMessages)
                {
                    console.log("new text editor, pushing waypoint...")  
                }
                
                push(currentWaypoint)
            }
            
            if (currentWaypoint == null)
            {
                return// we still haven't saved yet i guess?
            }
        }
    }
    
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
    const lineDiff = Math.abs(newWaypoint.line - currentWaypoint.line)
    const columnDiff = Math.abs(newWaypoint.column - currentWaypoint.column)

    // if we're 2+ units away, make a new waypoint
    // disregard column diff here, on purpose, it creates too many entries if you're typing fast, and this isn't what rider does.
    if (lineDiff >= newEntryDistanceInLines/* || columnDiff > 1*/)
    {
        const activeSelectionRange = newWaypoint.selectionStart - newWaypoint.selectionEnd
        if (activeSelectionRange == 0)
        {
            if (debugOptions.logChangeMessages)
            {
                console.log(newEntryDistanceInLines + "+ units away, pushing waypoint...")
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
// navigation
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
    
    handleCurrentIndexChanged(newIndex)
    
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
    
    handleCurrentIndexChanged(newIndex)
    
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
            handleCurrentIndexChanged(i)
            
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
            handleCurrentIndexChanged(i)
            
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

function navigateToSelection()
{
    var selectedWaypoint = treeView.selection[0]
    var previousWaypoint = trail[currentIndex]
    var newIndex = trail.indexOf(selectedWaypoint)
    
    handleCurrentIndexChanged(newIndex)
    
    var newWaypoint = trail[currentIndex]
    navigatingToDifferentFile = previousWaypoint.path != newWaypoint.path
    openWaypoint(trail[currentIndex])
};

//========================================================
// navigation
//========================================================
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
    if (waypoint == null)
    {
        return false
    }
    
    if (currentIndex < trail.length - 1)
    {
        // if we're not at the end of the trail, hack off the end.
        trail.splice(currentIndex + 1)
    }
    
    trail.push(waypoint);
    
    if (sidebarEnabled)
    {
        dataProvider.setWaypoints(trail)    
    }
    
    var newIndex = trail.length - 1// pushing should always put as at the end of the trail
    handleCurrentIndexChanged(newIndex)
    
    if (trail.length > historySize)
    {
        const amountToRemove = trail.length - historySize
        trail.splice(0, amountToRemove)
        
        // slide our index over, and clamp to stay in bounds.  i think this is all that's needed?
        newIndex = currentIndex
        newIndex -= amountToRemove 
        newIndex = clamp(currentIndex, 0, trail.length - 1)
        handleCurrentIndexChanged(newIndex)
    }
    
    logTrailMessage("pushed", waypoint)
    return true
}

function replaceLastWaypointWith(newWaypoint)
{
    trail[trail.length - 1] = newWaypoint
    
    if (sidebarEnabled)
    {
        dataProvider.setWaypoints(trail)
    }
    
    if (sidebarEnabled)
    {
        treeView.reload()    
    }
    
    if (debugOptions.logWaypointReplacements)
    {
        logTrailMessage("replaced", newWaypoint)
    }
}

function createWaypoint(editor) 
{
    const path = editor.document.path;
    if (path == null || path == "")
    {
        return null
    }
    
    const text = editor.document.getTextInRange(
        new Range(0, editor.document.length)
    );
    const selectionStart = editor.selectedRange.start
    const selectionEnd = editor.selectedRange.end
    const cursorPosition = selectionStart;
    const lines = text.slice(0, cursorPosition).split("\n");
    const line = lines.length;
    const column = lines.slice(-1)[0].length + 1;
    
    
    return { 
        path: path,
        filename: nova.path.basename(path),
        line: line, 
        column: column,
        selectionStart: selectionStart, 
        selectionEnd: selectionEnd 
    };
}

function handleCurrentIndexChanged(index)
{
    var prevIndex = currentIndex
    currentIndex = index
    
    if (sidebarEnabled)
    {
        dataProvider.setCurrentIndex(index)
        
        if (autoRevealFocusedIndex)
        {
            treeView.reload().then(handleTreeReloaded)
        }
        else 
        {
            treeView.reload()
        }
    }
}

const focusConst = {focus:true}

function handleTreeReloaded(result)
{
    treeView.reveal(trail[currentIndex], focusConst)
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
