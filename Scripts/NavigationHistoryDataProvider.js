class NavigationHistoryDataProvider 
{
    _jumpList;
    _currentJumpPosition;
    
    _COLOR_DEFAULT = new Color(ColorFormat.rgb, [0, 0, 0, 1]);
    _COLOR_CURRENT_POSITION = new Color(ColorFormat.rgb, [1, 0, 0.5, 1]);
    
    constructor() 
    {
        this._jumpList = [];
        this._currentJumpPosition = 0;
    }
    
    setWaypoints(list)
    {
        this._jumpList = list
    }
    
    setCurrentIndex(index) 
    {
        //console.log("setCurrentIndex " + index)
        this._currentJumpPosition = index
    }
    
    getChildren(element) 
    {
        if(element === null) 
        {
            return this._jumpList;
        }
        
        return [];
    }
    
    getParent(element)
    {
        return null
    }
    
    getTreeItem(element) 
    {
        //console.log("getTreeItem " + element.path)
        let item = new TreeItem(
            element.filename,
            TreeItemCollapsibleState.None
        );
        
        item.descriptiveText = element.line;
        //item.tooltip = "this is a tooltip"//element.humanReadable[getConfigItem("jumpList.tooltip.content")];
        item.command = "navigation.navigateToSelection";
        item.identifier = element.position;
        item.image = null
        
        item.color = this._jumpList.indexOf(element) === this._currentJumpPosition ?
            this._COLOR_CURRENT_POSITION : 
            this._COLOR_DEFAULT
        
        return item;
    }
}
    
module.exports = 
{
    NavigationHistoryDataProvider
};
