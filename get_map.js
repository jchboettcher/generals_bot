const { assert } = require('console');
const puppeteer = require('puppeteer');
const fs = require('fs')

class Bot {

	headless = true
	browser;
	page;
	general = {};
	otherCities = [];
	otherGenerals = [];
	myCities = [];
	width;
	height;
	x;
	y;
	currentArmies = 0;
	delay = 15
	movesQueue = []
	table;
	vis;
	phase = 0;
	gathering = 0;
	colors = ["blue", "green", "orange", "pink", "brown", "purple", "teal", "lightblue", "maroon", "yellow", "lightgreen"]
	cityPos = 0;
	cityCount = 0;
	goingForGeneral = false;

	// constructor() {
	// 	return new Promise(async (resolve, reject) => {
	// 		try {
	// 			this.browser = await puppeteer.launch({ headless : false });
	// 			this.page = await this.browser.newPage();
	// 			console.log("hi")
	// 		} catch (e) {
	// 			return reject(e);
	// 		}
	// 	})
	// }

	async drag(selector, value) {
		const bar = await this.get$(selector)
		const box = await bar.boundingBox()
		await this.page.mouse.move(box.x + box.width*0.5, box.y + box.height*0.5);
		await this.page.mouse.down();
		await this.page.mouse.move(box.x + box.width*value, box.y + box.height*0.5);
		await this.page.mouse.up();
	}

	async findAvailableRoom(c) {
		const browser = await puppeteer.launch();
		const page = await browser.newPage();
		let amHost = false;
		let counter = 0
		while (!amHost) {
			if (counter === c) {
				counter++
				continue
			}
			await page.goto(`http://generals.io/games/gomboc${!counter ? '' : counter - 1}`);
			await page.screenshot({ path: 'screenshot_home.png' });
			await page.waitForSelector('p.custom-host-message');
			let hostEl = null;
			while (!hostEl) {
				hostEl = await page.$('p.custom-host-message');
			}
			const hostMsg = await page.evaluate(el => el.textContent, hostEl);
			// console.log(counter, hostMsg);
			amHost = hostMsg.includes("Only");
			counter++
		}
		browser.close();
		return counter - 1
	}

	async getCell(i, j) {
		// console.log(`table > tbody > tr${' + tr'.repeat(j)} > td${' + td'.repeat(i)}`)
		return (await this.get$(`table > tbody > tr${' + tr'.repeat(j)} > td${' + td'.repeat(i)}`))
	}

	async getCellArmies(i, j) {
		// console.log("getting cell", i, j)
		const cell = await this.getCell(i, j);
		// console.log("got cell")
		const cellHandle = await this.page.evaluateHandle(body => body.innerHTML, cell);
		const cellValue = parseInt(await cellHandle.jsonValue());
		if (!cellValue) {
			return 0;
		}
		return cellValue;
	}

	async makeTable() {
		// await this.clickGeneral()
		await this.waitForArrows();
		this.currentArmies = await this.getCellArmies(this.x, this.y)
		console.log("updated:", this.currentArmies)
		const getTable = await this.get$('table#gameMap > tbody');
		const tableHandle = await this.page.evaluateHandle(body => body.innerHTML, getTable);
		const tableString = await tableHandle.jsonValue();
		if (tableString.includes('alert center')) {
			return false
		}
		const tableSubStr = tableString.substring(13,tableString.length - 10)
		const newTable = tableSubStr.split('</td></tr><tr><td class')
		for (let i = 0; i < newTable.length; i++) {
			// table[i] = table[i].split(/\">[0-9]*<\/td><td class=\"/)
			newTable[i] = newTable[i].split('</td><td class')
		}
		if (this.height && this.width) {
			if (newTable.length !== this.height || newTable[0].length !== this.width) {
				console.log("something weird happened", newTable.length, (newTable[0]) ? newTable[0].length : "none")
				console.log(newTable)
				return true;
			}
		}
		// console.log(tableString)
		// console.log(tableSubStr)
		// console.log(newTable)
		this.table = newTable
		this.height = this.table.length;
		this.width = this.table[0].length;
		this.vis = new Array(this.height * this.width)
		this.otherCities = []
		this.myCities = []
		this.otherGenerals = []
		console.log(this.width, this.height)
		for (let i = 0; i < this.height; i++) {
			for (let j = 0; j < this.width; j++) {
				const cell = this.table[i][j];
				if (cell.includes("obstacle")) {
					this.otherCities.push({x : j, y : i, val : 1000});
				} else if (cell.includes("city")) {
					const tryValue = parseInt(cell.substring(cell.lastIndexOf('>') + 1))
					const value = tryValue ? tryValue : 0;
					if (cell.includes("red")) {
						this.myCities.push({x : j, y : i, val : value});
					} else {
						this.otherCities.push({x : j, y : i, val : value});
					}
				} else if (cell.includes("general")) {
					if (cell.includes('red')) {
						if (!this.phase) {
							this.general.x = j;
							this.general.y = i;
						}
					} else {
						const tryValue = parseInt(cell.substring(cell.lastIndexOf('>') + 1))
						const value = tryValue ? tryValue : 0;
						this.otherGenerals.push({x : j, y : i, val : value})
					}
				}
				// const cellbeg = cell.substring(0,8);
				// // console.log(cell)
				// switch (cellbeg) {
				// 	case '="fog ob':
				// 		this.otherCities.push({x : j, y : i, val : 1000});
				// 		break;
				// 	case '=" city ':
				// 		this.otherCities.push({x : j, y : i, val : parseInt(cell.substring(20))});
				// 		break;
				// 	case '=" city"':
				// 		this.otherCities.push({x : j, y : i, val : parseInt(cell.substring(9))});
				// 		break;
				// 	case '="red ci':
				// 		this.myCities.push({x : j, y : i, val : parseInt(cell.substring(7))}); //broken
				// 		break;
				// 	case '="red ge':
				// 		if (!this.phase) {
				// 			this.general.x = j;
				// 			this.general.y = i;
				// 		}
				// }
			}
		}
		console.log(this.otherCities)
		console.log(this.general);
		return true
		// let height = 1
		// while (true) {
		// 	const row = await this.page.$(`table#map > tbody > tr${' + tr'.repeat(height)}`)
		// 	if (!row) {
		// 		break;
		// 	}
		// 	height++
		// }
		// let width = 1
		// while (true) {
		// 	const col = await this.page.$(`table#map > tbody > tr > td${' + td'.repeat(width)}`)
		// 	if (!col) {
		// 		break;
		// 	}
		// 	width++
		// }
		// console.log(width, height)
		// const grid = []
		// for (let j = 0; j < height; j++) {
		// 	await this.move(1)
		// 	console.log("moved left")
		// 	const row = []
		// 	for (let i = 0; i < width; i++) {
		// 		const cell = await this.getCell(i, j)
		// 		const className = await this.getClassName(cell)
		// 		row.push({ className })
		// 	}
		// 	grid.push(row)
		// }
		// console.log(grid)
		// return { width, height, grid }
		// return {width, height};
	}

	switchMove(r, x, y) {
		let move = null
		switch (r) {
			case 0:
				if (y > 0) {
					move = {x : x, y: y - 1}
				}
				break;
			case 1:
				if (x < this.width - 1) {
					move = {x : x + 1, y: this.y}
				}
				break;
			case 2:
				if (y < this.height - 1) {
					move = {x : x, y: y + 1}
				}
				break;
			case 3:
				if (x > 0) {
					move = {x : x - 1, y: y}
				}
		}
		return move
	}

	getRandMoveList(x, y) {
		const moveList = []
		const dead = []
		let count = 0
		for (let i = 0; i < 4; i++) {
			let r = -1;
			do {
				r = Math.floor(Math.random() * 4)
			} while (dead.includes(r));
			dead.push(r)
			const move = this.switchMove(r, x, y)
			if (move) {
				count++
				move.dir = r
				moveList.push(move)
			}
		}
		return {moveList, count}
	}

	search({ wantParam, avoidParam }) {
		let q = []
		this.vis.fill(false)
		q.push({x: this.x, y : this.y, moves : []})
		this.vis[this.y * this.width + this.x] = true;
		let counter = 0;
		while (q.length != 0) {
			const move = q.shift()
			counter++
			this.vis[move.y * this.width + move.x] = true;
			// console.log(move)
			if (counter > 2000) {
				console.log("ran out")
				return []
			}
			if (!avoidParam(move) || counter === 1) {
				if (wantParam(move) && counter !== 1) {
					// console.log("counter", counter)
					return move.moves
				}
				const {moveList, count} = this.getRandMoveList(move.x, move.y)
				for (let i = 0; i < count; i++) {
					const move_ = moveList[i]
					if (!this.vis[move_.y * this.width + move_.x]) {
						q.push({x: move_.x, y: move_.y, prevX: move.x, prevY: move.y, moves: move.moves.concat([move_.dir])})
					}
				}
			}
		}
		// console.log("stuck")
		return []
	}

	getClosestNonCity() {
		return this.search({
			wantParam : ({ x, y }) => !this.table[y][x].includes("red"),
			avoidParam : ({ x, y }) => (
				this.otherCities.some(city => city.x === x && city.y === y) ||
				this.otherGenerals.some(gen => gen.x === x && gen.y === y)
			)
		})
	}

	getClosestCity() {
		return this.search({
			wantParam : ({ x, y }) => this.otherCities.some(city => city.x === x && city.y === y),
			avoidParam : ({ x, y }) => this.general.x === x && this.general.y === y
		})
	}

	gatherFromCities() {
		return this.search({
			wantParam : ({ x, y }) => this.myCities.some(city => city.x === x && city.y === y),
			avoidParam : ({ x, y }) => (
				(this.general.x === x && this.general.y === y) ||
				this.otherCities.some(city => city.x === x && city.y === y) ||
				this.otherGenerals.some(gen => gen.x === x && gen.y === y)
			)
		})
	}

	gatherFromRegs() {
		return this.search({
			wantParam : ({ x, y }) => this.table[y][x].includes("red"),
			avoidParam : ({ x, y }) => (
				(this.general.x === x && this.general.y === y) ||
				this.otherCities.some(city => city.x === x && city.y === y) ||
				this.otherGenerals.some(gen => gen.x === x && gen.y === y)
			)
		})
	}

	smartGetCity() {
		return this.search({
			wantParam : ({ x, y }) => this.otherCities.some(city => city.x === x && city.y === y),
			avoidParam : ({ x, y }) => {
				if (this.general.x === x && this.general.y === y) { // dont wanna hit own general
					return true
				}
				const city = this.otherCities.find(city => city.x === x && city.y === y) // are we at a city
				if (city) { // if so
					console.log(x, y, this.currentArmies, city.val)
					return this.currentArmies < city.val // avoid if not enough armies
				}
				return (!this.table[y][x].includes("red")) // if not a city, avoid if not red
			}
		})
	}

	dist(x1, y1, x2, y2) {
		return (Math.abs(x2-x1) + Math.abs(y2-y1));
	}

	moveTowards(goalX, goalY, avoidParam) {
		let distance = -1;
		const moves = this.search({
			wantParam: ({ x, y, prevX, prevY }) => {
				distance = this.dist(x, y, goalX, goalY)
				return distance < this.dist(prevX, prevY, goalX, goalY)
			}, avoidParam
		})
		return {moves, distance}
	}

	async getClassName(selector) {
		return (await selector.getProperty('className')).toString().substring(9)
	}

	checkColors(string) {
		let out = false
		this.colors.forEach(col => out |= string.includes(col))
		return out
	}

	async move(direction) {
		if (typeof direction === "number") {
			direction = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][direction]
		}
		await this.page.keyboard.press(direction)
		const prevX = this.x;
		const prevY = this.y;
		switch (direction) {
			case 'ArrowUp':
				this.y = Math.max(0, this.y - 1)
				break;
			case 'ArrowRight':
				this.x = Math.min(this.width - 1, this.x + 1)
				break;
			case 'ArrowDown':
				this.y = Math.min(this.height - 1, this.y + 1)
				break;
			case 'ArrowLeft':
				this.x = Math.max(0, this.x - 1)
		}
		// console.log(direction, this.x, this.y)
		if (this.x !== prevX || this.y !== prevY) {
			// console.log(this.currentArmies)
			if (this.table[this.y][this.x].includes("red")) {
				this.currentArmies += await this.getCellArmies(this.x, this.y);
			} else if (!this.otherCities.some(city => city.x === this.x && city.y === this.y) &&
					   !this.checkColors(this.table[this.y][this.x])) {
				this.table[this.y][this.x] = "red"
				this.currentArmies--;
			} else {
				await this.makeTable()
				// const className = await this.getClassName(await this.getCell(this.x, this.y));
				// const army = this.myCities
				if (this.table[this.y][this.x].includes("red")) {
					this.currentArmies = await this.getCellArmies(this.x, this.y);
				} else {
					this.currentArmies = 0;
				}
			}
			// console.log(this.currentArmies)
		} else {
			// console.log("didn't move")
		}
	}

	async waitForArrows() {
		let arrow = 1;
		while (!!arrow) {
			arrow = await this.page.$("div.center-vertical");
		}
		arrow = 1;
		while (!!arrow) {
			arrow = await this.page.$("div.center-horizontal");
		}
	}

	async clickGeneral() {
		await this.waitForArrows()
		console.log("clicking general")
		const general = await this.get$("td.red.general")
		console.log("clicking general2")
		const generalHandle = await this.page.evaluateHandle(body => body.innerHTML, general);
		this.currentArmies = parseInt(await generalHandle.jsonValue());
		// if (general) {
		await general.click()
		this.x = this.general.x
		this.y = this.general.y
		// }
	}

	async clickCity() {
		if (this.myCities.length !== 0) {
			await this.waitForArrows()
			const city = this.myCities.reduce((prev, curr) => prev.val > curr.val ? prev : curr)
			const cityCell = await this.getCell(city.x, city.y)
			const cityHandle = await this.page.evaluateHandle(body => body.innerHTML, cityCell);
			console.log(await cityHandle.jsonValue())
			this.currentArmies = parseInt(await cityHandle.jsonValue());
			// if (general) {
			await cityCell.click()
			this.x = city.x
			this.y = city.y
			return true
		}
		// }
		return false
	}

	// async get$x(selector) {
	// 	let element = null;
	// 	while (!element) {
	// 		element = await this.page.$x(selector)
	// 	}
	// 	return element;
	// }

	async get$x(selector) {
		let element = null;
		let counter = 0;
		while (!element && counter++ < 250) {
			const [el] = await this.page.$x(selector);
			element = el;
			console.log("counter:",counter)
		}
		return element;
	}

	async get$(selector) {
		let element = null;
		let counter = 0;
		while (!element && counter++ < 250) {
			element = await this.page.$(selector)
		}
		return element;
	}

	run() {
		return new Promise(async (resolve, reject) => {
			try {
				console.log("Restarting...")
				const file = fs.readFileSync('go.txt', 'utf8');
				if (file === "headless") {
					this.headless = true
				} else if (file === "not headless") {
					this.headless = false
				} else {
					return
				}
				this.browser = await puppeteer.launch({ headless : this.headless });
				this.page = await this.browser.newPage();
				await this.page.setViewport({width: 3000, height: 3000})
				// can replace this with any account:
				await this.page.goto('http://generals.io/?user_id=HJ5R6HdAP&email=garynovakk%40gmail.com')
				await this.page.waitForSelector('#leaderboardhistory-button');
				// let firstTime = true;
				while (true) {
					this.general = {};
					this.otherCities = [];
					this.otherGenerals = [];
					this.myCities = [];
					this.width = null;
					this.height = null;
					this.currentArmies = 0;
					this.movesQueue = []
					this.phase = 0;
					this.gathering = 0;
					this.cityPos = 0;
					this.cityCount = 0;
					this.goingForGeneral = false;
					let amHost = false;
					let counter = 0
					while (!amHost) {
						// if (firstTime) {
						await this.page.goto(`http://generals.io/games/gomboc${!counter ? '' : counter - 1}`);
						// await this.page.goto(`http://generals.io/games/play`); // myssix
						// firstTime = false;
						// } else {
						// 	const playAgainButton = await this.get$x('//button.invertec[text()="Play Again"]');
						// 	playAgainButton.click();
						// }
						await this.page.screenshot({ path: 'screenshot_home.png' });
						await this.page.waitForSelector('p.custom-host-message');
						const hostEl = await this.get$('p.custom-host-message');
						const hostMsg = await this.page.evaluate(el => el.textContent, hostEl);
						console.log(hostMsg);
						amHost = hostMsg.includes("Only");
						if (!amHost) {
							// firstTime = true;
							counter = await this.findAvailableRoom(counter)
							await this.page.keyboard.type(`\n Need to be host to play, moving to http://generals.io/games/gomboc${!counter ? '' : counter - 1}\n`)
						}
					}
					assert(amHost);
					const privacyButton = await this.get$x('//div[text()="Privacy"]')
					// Promise.all([
					await privacyButton.click();
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					const goPublicButton = await this.get$x('//button[text()="Go Public"]');
					// Promise.all([
					await goPublicButton.click()
					await this.page.waitForSelector('.custom-queue-page-container')	
					// ])
					console.log("Set game to public.")
					const gameButton = await this.get$x('//div[text()="Game"]');
					// Promise.all([
					await gameButton.click()
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					const game4xButton = await this.get$x('//div[text()="4x"]');
					// Promise.all([
					await game4xButton.click()
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					console.log("Set game speed to 4x.")
					const mapButton = await this.get$x('//div[text()="Map"]');
					// Promise.all([
					await mapButton.click()
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					// Promise.all([
					await this.drag("h3.custom-queue-slider-header.first + div > input", 1)
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					// Promise.all([
					await this.drag("h3.custom-queue-slider-header.first + div + h3 + div > input", 1)
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					console.log("Set map size to maximum.")
					const terrainButton = await this.get$x('//div[text()="Terrain"]');
					// Promise.all([
					await terrainButton.click()
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					// Promise.all([
					await this.drag("h3.custom-queue-slider-header.first + div > input", 1)
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					console.log("Set city density to high.")
					// Promise.all([
					await this.drag("h3.custom-queue-slider-header.first + div + h3 + div > input", 0)
					await this.page.waitForSelector('.custom-queue-page-container')
					// ])
					console.log("Set mountain density to low.")
					console.log("Set swamp density to none.")
					// let color = 'red'
					while (true) {
						// const startButton = await page.$("div.center.center-tag > div + button");
						const [startButton] = await this.page.$x("//button[contains(.,'Force Start')]");
						if (startButton) {
							if (!(await this.getClassName(startButton)).includes("inverted")) {
								await startButton.click();
							}
						}
						const general = await this.page.$("td.general.selectable")
						if (general) {
							await general.click()
							// const className = await this.getClassName(general)
							// color = className.substring(0, className.indexOf("general") - 1)
							break;
						}
					}
					await this.makeTable()
					// await this.clickGeneral()
					await (await this.getCell(0,0)).click()
					await (await this.getCell(0,this.height - 1)).click()
					await (await this.getCell(this.width - 1,0)).click()
					await (await this.getCell(this.width - 1,this.height - 1)).click()
					console.log("success")
					while (true) {
						console.log("checking")
						const alert = await this.page.$("div.alert.center")
						if (alert) {
							console.log("found alert $")
							break;
						}
						if (!(++this.phase % 10)) {
							if (!(await this.makeTable())) {
								console.log("found alert in table")
								break;
							}
						}
						this.cityCount = this.myCities.length
						this.otherCities.sort(
							(city1, city2) => (
								this.dist(city1.x, city1.y, this.x, this.y) - this.dist(city2.x, city2.y, this.x, this.y)
							)
						)
						if (!this.goingForGeneral) {
							this.myCities.sort(
								(city1, city2) => (
									this.dist(city1.x, city1.y, this.x, this.y) - this.dist(city2.x, city2.y, this.x, this.y)
								)
							)
						}
						let bestGeneral = null
						const lowGenerals = this.otherGenerals.filter(gen => gen.val < this.currentArmies + 40 * this.cityCount)
						if (lowGenerals.length !== 0) {
							bestGeneral = lowGenerals.reduce((prev, curr) => prev.val > curr.val ? prev : curr)
						}
						if (bestGeneral) {
							this.goingForGeneral = true;
							if (this.movesQueue.length === 0) {
								let distance = -1;
								if (this.cityPos === this.cityCount) {
									console.log("going for general (attack phase)!")
									const movesOutput = this.moveTowards(
										bestGeneral.x, 
										bestGeneral.y, 
										({ x, y }) => (
											(this.general.x === x && this.general.y === y) ||
											this.otherCities.some(city => city.x === x && city.y === y)
										)
									)
									this.movesQueue = movesOutput.moves
									distance = movesOutput.distance
									if (this.movesQueue.length === 0) {
										bestGeneral = null
									}
								} else {
									console.log("going for general (gathering phase)!")
									const city = this.myCities[this.cityPos]
									const movesOutput = this.moveTowards(
										city.x,
										city.y,
										({ x, y }) => (
											(this.general.x === x && this.general.y === y) ||
											this.otherCities.some(city => city.x === x && city.y === y)
										)
									)
									this.movesQueue = movesOutput.moves
									distance = movesOutput.distance
								}
								if (distance === 0) {
									if (this.cityPos === this.cityCount) {
										this.cityPos === 0
									} else {
										this.cityPos++
									}
								}
							}
						}
						if (!bestGeneral) {
							this.goingForGeneral = false;
							if (this.phase < 300) {
								console.log(this.phase)
								if (this.currentArmies <= 1) {
									await this.makeTable()
									await this.clickGeneral()
									this.movesQueue = []
								} else {
									if (this.movesQueue.length === 0) {
										this.movesQueue = this.getClosestNonCity()
									}
									if (this.movesQueue.length === 0 && this.phase >= 290) {
										this.gathering = 3;
										this.phase = 300;
									}
								}
							} else {
								console.log("armies:", this.currentArmies)
								let clicked = false
								if (this.gathering-- > 0) {
									console.log("gatherfromregs")
									this.movesQueue = this.gatherFromRegs()
									console.log("done gatherfromregs")
								} else if (this.currentArmies <= 1) {
									console.log("gatherfromcities")
									// await this.makeTable()
									// const success = await this.clickCity()
									this.movesQueue = this.gatherFromCities()
									console.log("done gatherfromcities")
									if (this.movesQueue.length === 0) {
										await this.makeTable()
										clicked = await this.clickCity()
									}
								} else {
									// if (this.movesQueue.length === 0) {
									console.log("grabcity")
									this.movesQueue = this.smartGetCity()
									console.log("done grabcity")
									// }
									if (this.movesQueue.length === 0) {
										console.log("grabnoncity")
										this.movesQueue = this.getClosestNonCity()
										console.log("done grabnoncity")
									}
									if (this.movesQueue.length === 0) {
										if (this.otherCities.length === 0) {
											console.log("gatherfromregs")
											this.movesQueue = this.gatherFromRegs()
											console.log("done gatherfromregs")
										} else {
											console.log("movetowardscity")
											this.movesQueue = this.moveTowards(
												this.otherCities[0].x,
												this.otherCities[1].y,
												({ x, y }) => this.general.x === x && this.general.y === y
											).moves
											console.log("done movetowardscity")
										}
									}
								}
								// }
								if (this.movesQueue.length === 0 && !clicked) {
									this.phase = 295;
								}
							}
						}
						if (this.movesQueue.length !== 0) {
							await this.move(this.movesQueue.shift())
						}
						// const selected = await this.page.$('td.selected')
						// let restart = true
						// if (selected) {
						// 	const className = await this.getClassName(selected)	
						// 	console.log(className)
						// 	restart = !(className.includes(color))
						// }
						// if (restart) {
						// 	await this.page.keyboard.press('q')
						// 	await this.clickGeneral()
						// }
						// const r = Math.random()
						// if (r < 0.25) {
						// 	await this.move('ArrowLeft')
						// } else if (r < 0.5) {
						// 	await this.move('ArrowRight')
						// } else if (r < 0.75) {
						// 	await this.move('ArrowUp')
						// } else {
						// 	await this.move('ArrowDown')
						// }
						await this.page.waitForTimeout(this.delay)
					}
				}
				// await this.page.screenshot({ path: 'screenshot_after.png' });
				// browser.close();
			} catch (e) {
				this.browser.close()
				console.log("FAILURE")
				return this.run();
			}
		})
	}
}

const bot = new Bot()
bot.run().then(console.log).catch(console.error);



// [
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog obstacle"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog obstacle"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog obstacle"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog obstacle"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog obstacle"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog obstacle"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog obstacle"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '""></td>',    '" attackable"></td>',
// 	  '""></td>',    '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog obstacle"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '" attackable"></td>',
// 	  '"red selected50 general selected selectable">50%</td>',
// 	  '" attackable"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog obstacle"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>',
// 	  '"fog obstacle"></td>',
// 	  '"fog"></td>',
// 	  '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',                 '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '""></td>',             '" attackable"></td>',
// 	  '""></td>',             '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>',
// 	  '"fog obstacle"></td>', '"fog"></td>',
// 	  '"fog"></td>',          '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[
// 	  '<tr>',        '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>',
// 	  '"fog"></td>', '"fog"></td>'
// 	],
// 	[ '' ]
//   ]