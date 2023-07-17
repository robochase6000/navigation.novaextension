//const { Jump } = require('./Jump');
//const { calculateLineColumnNumber, getConfigItem } = require('./helpers');

/**
 * The data provider for this extension's tree view. Extensions have been added to manage the jump list as that data is all contained here.
 */
class NavigationHistoryDataProvider {
  /** An array containing all available jumps. */
  _jumpList;
  /** The current of the jump currently in use. */
  _currentJumpPosition;
  
  _COLOR_DEFAULT = new Color(ColorFormat.rgb, [0, 0, 0, 1]);
  _COLOR_CURRENT_POSITION = new Color(ColorFormat.rgb, [1, 0, 0.5, 1]);

  constructor() {
	this._jumpList = [];
	this._currentJumpPosition = 0;
  }
  
  setWaypoints(list)
  {
	  this._jumpList = list
  }
  
  setCurrentIndex(index) {
	  //console.log("setCurrentIndex " + index)
	  this._currentJumpPosition = index
  }

  /**
   * Get TreeItem children. Root element is always null, this TreeView doesn't support nesting.
   *
   * @param {Object} element
   * @returns {Array<Jump>}
   */
  getChildren(element) {
	if(element === null) {
	  return this._jumpList;
	}

	return [];
  }
	
  /**
   * Get a jump to add to the TreeView.
   *
   * @param {Jump} element - The jump to retrieve
   */
  getTreeItem(element) {
	//console.log("getTreeItem " + element.path)
	let item = new TreeItem(
		element.filename,
		TreeItemCollapsibleState.None
	);

	item.descriptiveText = element.line;
	//item.tooltip = "this is a tooltip"//element.humanReadable[getConfigItem("jumpList.tooltip.content")];
	item.command = "navigation.jumpTo";
	item.identifier = element.position;
	item.image = null
	if(this._jumpList.indexOf(element) === this._currentJumpPosition) {
	  item.color = this._COLOR_CURRENT_POSITION;
	}
	else 
	{
		item.color = this._COLOR_DEFAULT;
	}

	return item;
  }

  /**
   * Get the current jump in use.
   * @returns {number}
   */
  getCurrentPosition() {
	return this._currentJumpPosition;
  }

  /**
   * Set the jump currently in use.
   * @param {number} jumpIndex - The index of the jump you wish to set as current.
   */
  setCurrentPosition(jumpIndex) {
	this._currentJumpPosition = jumpIndex;
  }

  /**
   * Get a specific jump from the list.
   * @param {number} jumpIndex - The position of the jump in the list to get.
   */
  getJump(jumpIndex) {
	return this._jumpList.find((jump) => jump.position === jumpIndex);
  }

  /**
   * Get the currently selected jump.
   * @returns {Jump}
   */
  getCurrentJump() {
	return this._jumpList.find(
	  (jump) => jump.position === this._currentJumpPosition
	);
  }

  /**
   * Empty out all or part of the jump list.
   * @param {Number} jumpIndex - The jump index to start from; if provided, any jumps more recent than the identified jump will be removed from the list. If not provided, the list is emptied completely.
   */
  emptyJumpList(jumpIndex) {
	if(jumpIndex) {
	  this._jumpList = this._jumpList.slice(0, jumpIndex);

	  if(jumpIndex < this._currentJumpPosition) {
		this._currentJumpPosition = jumpIndex;
	  }
	} else {
	  this._jumpList = [];
	  this._currentJumpPosition = -1;
	}
  }
}

module.exports = {
  NavigationHistoryDataProvider
};
