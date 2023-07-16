//========================================================
// navigation.novaextension
//
// i'm not a javascript whiz, what follows may break convention
//========================================================
exports.activate = function () {};
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
// commands
//========================================================
nova.commands.register("navigation.forward", (editor) => { navigateForward() });
nova.commands.register("navigation.back", (editor) => { navigateBackward() });


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
function navigateForward()
{
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

function navigateBackward()
{
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
    
    logTrailMessage("pushed", waypoint)
}

function replaceLastWaypointWith(newWaypoint)
{
    trail[trail.length - 1] = newWaypoint
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
        line: line, 
        column: column,
        selectionStart: selectionStart, 
        selectionEnd: selectionEnd 
    };
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
        var navChar = ""
        if (i == currentIndex){ navChar = "*" }
            
        console.log("  " + navChar + " " + i + "/" + trail.length + "- " + waypoint.line + " " + waypoint.path)
    }
}
