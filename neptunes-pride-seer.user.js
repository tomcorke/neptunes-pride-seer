// ==UserScript==
// @name         Neptune's Pride Seer
// @namespace    http://tomcorke.com/
// @version      0.3.0
// @description  Helps you to take over the world!
// @author       Shot
// @include      http://np.ironhelmet.com/game/*
// @include      http://triton.ironhelmet.com/game/*
// @grant        none
// ==/UserScript==
/* jshint -W097 */
'use strict';

window.np_seer = window.np_seer || function($, console) {

    var enableLogOutput = false;

    function log() {
        if (enableLogOutput && console) {
            console.log.apply(console, arguments);
        }
    }

    var np = window.NeptunesPride;
    var u = np.universe;

    var c = $('<div>').css({
        position: 'absolute',
        top: 0,
        right: 0,
        padding: '5px 10px',
        backgroundColor: 'rgba(0,0,0,0.5)',
        color: 'white',
        fontSize: '12px',
        lineHeight: '110%',
        pointerEvents: 'none'
    }).appendTo('body');

    c.hide();

    var min = Math.min;
    var max = Math.max;

    var show = false;
    var autoUpdate = false;
    var ticksPerUpdate = 10;
    var ticksSinceUpdate = 0;

    var ticksToSimulate = 12;
    var ticksToSimulateAdjust = 6;

    np.np.on('one_second_tick', function() {
        if (!autoUpdate) return;
        ticksSinceUpdate++;
        if (ticksSinceUpdate >= ticksPerUpdate) {
            ticksSinceUpdate = 0;
            update();
        }
    });

    function getLiveState() {
        return copyState(u.galaxy, true, u.player);
    }

    var COMMAND_NOTHING = 0;
    var COMMAND_COLLECT_ALL = 1;
    var COMMAND_DROP_ALL = 2;
    var COMMAND_COLLECT_SOME = 3;
    var COMMAND_DROP_SOME = 4;
    var COMMAND_COLLECT_ALL_BUT = 5;
    var COMMAND_DROP_ALL_BUT = 6;
    var COMMAND_GARRISON = 7;

    function parseOrder(order) {
        return {
            // unknown: order[0], No idea what this is
            star: order[1],
            command: order[2],
            amount: order[3],
            ticks: order[4]
        };
    }

    function playerIcon(player) {
        var _player = player || {
            shapeIndex: 0,
            color: 'white'
        };
        // player.color player.shapeIndex
        return $('<div>').css({
            display: 'inline-block',
            width: '12px',
            height: '12px',
            borderRadius: _player.shapeIndex === 0 ? '6px' : '0',
            backgroundColor: _player.color
        })[0].outerHTML;
    }

    function playerColorText(player, text) {
        var _player = player || {
            color: 'white'
        };
        return $('<span>').text(text).css('color', _player.color)[0].outerHTML;
    }
    function colouredStarName(state, star) {
        return playerColorText(state.players[star.puid], star.n);
    }
    function colouredPlayerName(player) {
        return playerColorText(player, player.alias);
    }
    function colouredFleetName(state, fleet) {
        return playerColorText(state.players[fleet.puid], fleet.n);
    }

    function copyState(state, initialCopy, player) {
        initialCopy = initialCopy || false;

        // Copy tick and production properties
        var newState = {
            tick: state.tick,
            tick_rate: state.tick_rate,
            tick_fragment: state.tick_fragment,
            now: state.now,
            production_counter: state.production_counter,
            production_rate: state.production_rate
        };

        // Copy fleets
        newState.fleets = {};
        Object.keys(state.fleets).forEach(function(id) {
            var fleet = state.fleets[id];
            if (!fleet.isDead) {
                newState.fleets[id] = {
                    n: fleet.n,
                    orders: fleet.orders.map(function(order) {
                        return order.slice();
                    }),
                    puid: fleet.puid,
                    st: fleet.st,
                    orbiting: initialCopy ? fleet.orbiting ? fleet.orbiting.uid : null : fleet.orbiting,
                    loop: fleet.loop
                };
            }
        });

        // Copy stars
        newState.stars = {};
        Object.keys(state.stars).forEach(function(id) {
            var star = state.stars[id];
            newState.stars[id] = {
                n: star.n,
                puid: star.puid !== null ? star.puid > -1 ? star.puid : null : null,
                st: star.st,
                fleetsInOrbit: initialCopy ? star.fleetsInOrbit.map(function(fleet) {
                    return fleet.uid;
                }) : star.fleetsInOrbit.slice(),
                industry: initialCopy ? star.i : star.industry,
                bitsOfShips: initialCopy ? 0.0 : star.bitsOfShips,
                x: star.x,
                y: star.y,
                ga: star.ga, // Has warp gate
                science: initialCopy ? star.s : star.science
            };
        });

        // Copy players
        newState.players = {};
        Object.keys(state.players).forEach(function(id) {
            var player = state.players[id];
            newState.players[id] = {
                alias: player.alias,
                color: player.color,
                shapeIndex: player.shapeIndex,
                tech: Object.keys(player.tech).reduce(function(o, key) {
                    o[key] = Object.assign({}, player.tech[key]);
                    return o;
                }, {})
            };
        });

        // Copy current player
        var _player = initialCopy ? player : state.player;
        newState.player = {
            tech: Object.keys(_player.tech).reduce(function(o, k) {
                var tech = _player.tech[k];
                o[k] = {
                    brr: tech.brr,
                    bv: tech.bv,
                    level: tech.level,
                    research: tech.research,
                    value: tech.bv
                };
                return o;
            }, {}),
            researching: _player.researching,
            researching_next: _player.researching_next,
            uid: _player.uid
        };

        return newState;
    }

    function performOrder(fleetId, fleet, star, order) {
        var ships = 0;

        if (order.command == COMMAND_COLLECT_ALL) {
            var _ships = star.st;
            log(fleetId + ' ' + fleet.n + ' collecting all ' + _ships + '/' + star.st + ' at ' + order.star + ' ' + star.n);
            fleet.st += _ships;
            star.st -= _ships;
            log('New totals: Fleet: ' + fleet.st + ', Star: ' + star.st);
        } else if (order.command == COMMAND_DROP_ALL) {
            ships = max(0, fleet.st - 1);
            log(fleetId + ' ' + fleet.n + ' dropping all ' + ships + '/' + fleet.st + ' at ' + order.star + ' ' + star.n);
            fleet.st -= ships;
            star.st += ships;
            log('New totals: Fleet: ' + fleet.st + ', Star: ' + star.st);
        } else if (order.command == COMMAND_COLLECT_SOME) {
            ships = min(star.st, order.amount);
            log(fleetId + ' ' + fleet.n + ' collecting ' + ships + '/' + star.st + ' at ' + order.star + ' ' + star.n);
            fleet.st += ships;
            star.st -= ships;
            log('New totals: Fleet: ' + fleet.st + ', Star: ' + star.st);
        } else if (order.command == COMMAND_DROP_SOME) {
            ships = min(fleet.st - 1, order.amount);
            log(fleetId + ' ' + fleet.n + ' dropping ' + ships + '/' + fleet.st + ' at ' + order.star + ' ' + star.n);
            fleet.st -= ships;
            star.st += ships;
            log('New totals: Fleet: ' + fleet.st + ', Star: ' + star.st);
        } else if (order.command == COMMAND_COLLECT_ALL_BUT) {
            ships = max(0, star.st - order.amount);
            log(fleetId + ' ' + fleet.n + ' collecting ' + ships + '/' + star.st + ' at ' + order.star + ' ' + star.n);
            fleet.st += ships;
            star.st -= ships;
            log('New totals: Fleet: ' + fleet.st + ', Star: ' + star.st);
        } else if (order.command == COMMAND_DROP_ALL_BUT) {
            ships = max(0, fleet.st - order.amount);
            log(fleetId + ' ' + fleet.n + ' dropping ' + ships + '/' + fleet.st + ' at ' + order.star + ' ' + star.n);
            fleet.st -= ships;
            star.st += ships;
            log('New totals: Fleet: ' + fleet.st + ', Star: ' + star.st);
        }
    }

    function getStarDistance(ida, idb) {
        var stara = u.galaxy.stars[ida];
        var starb = u.galaxy.stars[idb];
        return u.starDistance(stara, starb);
    }

    function getStarDistanceTicks(ida, idb) {
        var distance = getStarDistance(ida, idb);
        var stara = u.galaxy.stars[ida];
        var starb = u.galaxy.stars[idb];
        var speed = u.starsGated(stara, starb) ? u.galaxy.fleet_speed * 3.0 : u.galaxy.fleet_speed;
        return Math.ceil(distance / speed);
    }

    function tickState(oldState) {

        var newState = copyState(oldState);

        var events = [];

        // https://triton.ironhelmet.com/help/faq

        // Increment tick number
        newState.tick = oldState.tick + 1;
        log('%ctick: ' + newState.tick, 'padding: 1px 5px; border-radius: 2px; background-color: red; color: white;');

        // Move carriers - if they land on a star do unit orders

        Object.keys(newState.fleets).forEach(function(id) {
            var fleet = newState.fleets[id];

            var hasMoved = false;

            fleet.orders.forEach(function(order) {
                order[4]--; // Decrement ticks

                if (hasMoved) {
                    return;
                }

                hasMoved = true;

                if (fleet.orbiting) {
                    var orbitingStar = newState.stars[fleet.orbiting];
                    log('Removing fleet ' + id + ' ' + fleet.n + ' from star ' + fleet.orbiting + ' ' + orbitingStar.n);
                    orbitingStar.fleetsInOrbit = orbitingStar.fleetsInOrbit.filter(function(fleetId) {
                        return fleetId != id;
                    });
                }

                fleet.orbiting = null;

                var pOrder = parseOrder(order);

                if (pOrder.ticks === 0) {
                    var star = newState.stars[pOrder.star];

                    fleet.orbiting = pOrder.star;
                    log('Fleet ' + id + ' ' + fleet.n + ' landing at ' + pOrder.star + ' ' + star.n, fleet, star, star.fleetsInOrbit);
                    star.fleetsInOrbit.push(parseInt(id));

                    if (fleet.puid !== star.puid) {
                        events.push('<span class=\'icon-rocket\'></span> ' + colouredFleetName(newState, fleet) + ' &#8594; ' + colouredStarName(newState, star));
                    }

                    if (!star.puid || fleet.puid == star.puid) {
                        performOrder(id, fleet, star, pOrder);
                    } else if (star.puid && fleet.puid != star.puid) {
                        fleet.delayedOrder = pOrder;
                    }
                }
            });

            if (fleet.orders.length > 0 && fleet.orders[0][4] === 0) {
                var order = fleet.orders.shift();
                if (fleet.loop) {
                    var lastOrder = fleet.orders[fleet.orders.length - 1];
                    order[4] = getStarDistanceTicks(lastOrder[1], order[1]);
                    fleet.orders.push(order);
                }
            }
        });

        // Combat at stars

        Object.keys(newState.stars).forEach(function(id) {
            var star = newState.stars[id];

            var conflict = false;
            var inOrbitPlayerId = null;

            star.fleetsInOrbit.forEach(function(fleetId) {
                var fleet = newState.fleets[fleetId];
                if (star.puid !== null && fleet && fleet.puid !== star.puid) {
                    conflict = true;
                }
                if (inOrbitPlayerId !== null && inOrbitPlayerId !== fleet.puid) {
                    conflict = true;
                }
                inOrbitPlayerId = fleet.puid;
            });

            // Let battle commence!
            if (conflict) {
                (function() {
                    var defenderId = null;
                    var attackerId = null;

                    // Get defender
                    if (star.puid) {
                        defenderId = star.puid;
                    } else {
                        defenderId = star.fleetsInOrbit.map(function(fid) {
                            return newState.fleets[fid].puid;
                        })[0];
                    }

                    // Assign attacker
                    attackerId = star.fleetsInOrbit.map(function(fid) {
                        return newState.fleets[fid].puid;
                    }).filter(function(id) {
                        return id != defenderId;
                    })[0];

                    var defender = newState.players[defenderId];
                    var attacker = newState.players[attackerId];

                    // Battle!
                    var defenderShips = star.fleetsInOrbit.map(function(fid) {
                        return newState.fleets[fid];
                    }).filter(function(fleet) {
                        return fleet.puid === defenderId;
                    }).reduce(function(total, fleet) {
                        return total + fleet.st;
                    }, star.st);
                    var attackerShips = star.fleetsInOrbit.map(function(fid) {
                        return newState.fleets[fid];
                    }).filter(function(fleet) {
                        return fleet.puid === attackerId;
                    }).reduce(function(total, fleet) {
                        return total + fleet.st;
                    }, 0);

                    var winnerId = null;

                    var defenderLosses = 0;
                    var attackerLosses = 0;

                    if (defender && attacker) {
                        log(defender, attacker, star, star.fleetsInOrbit.map(function(id) {
                            return newState.fleets[id];
                        }));
                        log('Resolving battle between ' + defender.alias + ' and ' + attacker.alias + ' at ' + star.n + ': ' + defenderShips + ' ships defending, ' + attackerShips + ' attacking');
                        if (defenderShips > 0) {
                            events.push('<span class=\'icon-tools\'></span> <span style=\'color:red\'>Battle</span> at ' + colouredStarName(newState, star) + '. ' + defenderShips + ' defending, ' + attackerShips + ' attacking');
                        }
                    }

                    while (defenderShips > 0 && attackerShips > 0) {
                        attackerLosses += min(attackerShips, defender.tech.weapons.value + 1);
                        attackerShips = max(0, attackerShips - (defender.tech.weapons.value + 1));
                        if (attackerShips === 0) {
                            log('Defender wins with ${defenderShips} remaining!');
                            winnerId = defenderId;
                            break;
                        }

                        defenderLosses += min(defenderShips, attacker.tech.weapons.value);
                        defenderShips = max(0, defenderShips - attacker.tech.weapons.value);
                        if (defenderShips === 0) {
                            log('Attacker wins with ${attackerShips} remaining}!');
                            winnerId = attackerId;
                            break;
                        }
                    }

                    while (defenderLosses > 0 || attackerLosses > 0) {
                        if (star.st > 0 && defenderLosses > 0) {
                            star.st--;
                            defenderLosses--;
                        }
                        star.fleetsInOrbit.forEach(function(id) {
                            var fleet = newState.fleets[id];
                            if (fleet.puid === defenderId) {
                                if (fleet.st > 0 && defenderLosses > 0) {
                                    fleet.st--;
                                    defenderLosses--;
                                }
                            } else {
                                if (fleet.st > 0 && attackerLosses > 0) {
                                    fleet.st--;
                                    attackerLosses--;
                                }
                            }
                            if (fleet.st === 0 && !fleet.isDead) {
                                log('Marking fleet ' + fleet.n + ' dead as it has 0 ships');
                                events.push('<span class=\'icon-cancel\'></span> Carrier ' + colouredFleetName(newState, fleet) + ' destroyed');
                                fleet.isDead = true;
                            }
                        });
                    }

                    log(winnerId);
                    if (winnerId) {
                        log('Attacker', attackerId, attacker, 'Defender', defenderId, defender, winnerId);
                        log('Winner of battle: ' + winnerId + ' ' + newState.players[winnerId].alias + '. Defender ships: ' + defenderShips + ', Attacker ships: ' + attackerShips);
                        events.push('<span class=\'icon-tools\'></span> Result: ' + defenderShips + ' defending, ' + attackerShips + ' attacking');
                    }

                    log('Removing dead fleets', star.fleetsInOrbit);
                    var fleetCount = star.fleetsInOrbit.length;
                    star.fleetsInOrbit = star.fleetsInOrbit.filter(function(id) {
                        return !newState.fleets[id].isDead;
                    });
                    if (star.fleetsInOrbit.length != fleetCount) {
                        log('Removed some fleets', star.fleetsInOrbit);
                    }
                })();
            }

            // If any orbiting fleets, player owns star
            if (star.fleetsInOrbit.length > 0) {
                var newOwnerId = newState.fleets[star.fleetsInOrbit[0]].puid;
                if (newOwnerId && newOwnerId != star.puid) {
                    events.push('<span class=\'icon-award\'></span> ' + colouredStarName(newState, star) + ' conquered by ' + colouredPlayerName(newState.players[newOwnerId]));
                    // Reset bits of shisp on star
                    star.bitsOfShips = 0.0;
                }
                star.puid = newOwnerId;
            }
        });

        // Delayed orders after combat for non-dead carriers

        Object.keys(newState.fleets).forEach(function(id) {
            var fleet = newState.fleets[id];
            if (fleet.isDead) {
                return;
            }
            if (!fleet.delayedOrder) {
                return;
            }

            var star = newState.stars[fleet.orbiting];
            performOrder(id, fleet, star, fleet.delayedOrder);
        });

        // Industry produces ships

        Object.keys(newState.stars).forEach(function(id) {
            var star = newState.stars[id];

            if (!star.puid) {
                return;
            }

            var starPlayer = newState.players[star.puid];
            var shipsPerTick = star.industry * (starPlayer.tech.manufacturing.level + 5) / newState.production_rate;
            star.bitsOfShips += shipsPerTick;

            while (star.bitsOfShips > 1) {
                star.st++;
                star.bitsOfShips--;
            }
        });

        // Conduct research

        var totalScience = Object.keys(newState.stars).reduce(function(total, s) {
            var star = newState.stars[s];
            return total + (star.puid === newState.player.uid ? star.science : 0);
        }, 0);

        var researchingTech = newState.player.tech[newState.player.researching];
        researchingTech.research += totalScience;
        var researchNeeded = researchingTech.brr * researchingTech.level;
        if (researchingTech.research >= researchNeeded) {
            researchingTech.research -= researchNeeded;
            researchingTech.level++;
            events.push('<span class=\'icon-beaker\'></span> Research completed: ' + newState.player.researching + ' level ' + researchingTech.level);
            researchingTech.value = researchingTech.bv * researchingTech.level;
            newState.players[newState.player.uid].tech[newState.player.researching].level = researchingTech.level;
            newState.players[newState.player.uid].tech[newState.player.researching].value = researchingTech.value;
            newState.player.researching = newState.player.researching_next;
        }

        // If end of turn, do production (money and experimentation)
        newState.production_counter++;
        if (newState.production_counter >= newState.production_rate) {
            newState.production_counter = 0;

            // Do production

            // Actually, we don't care about money and experimentation is random!
        }

        // Check for win

        return {
            prevState: oldState,
            newState: newState,
            events: events
        };
    }

    function update() {
        c.empty();

        var ticks = max(1, ticksToSimulate);
        c.append($('<p>').text('Simulating ' + ticks + ' ticks'));

        var state = getLiveState();

        var tick = 0;

        var tickTime = state.now - state.tick_fragment * state.tick_rate * 60 * 1000;

        while (tick < ticks) {
            tick++;
            tickTime += state.tick_rate * 60 * 1000;
            var tickDate = new Date(tickTime);
            var hours = '0' + tickDate.getHours();
            var minutes = '0' + tickDate.getMinutes();
            var seconds = '0' + tickDate.getSeconds();
            var formattedTime = hours.substr(-2) + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

            var result = tickState(state);
            state = result.newState;
            var events = result.events;

            var p = $('<p>');
            if (events.length > 0) {

                p.append($('<div>').text(state.tick + ' @ ' + formattedTime + ':'));
                p.append(events.map(function(event) {
                    return $('<div>').html(event);
                }));
                c.append(p);
            } else {
                c.append('-');
            }
        }
    }

    window.addEventListener('keyup', function(event) {
        if (event.keyCode == 223) {
            // `
            event.preventDefault();
            show = !show;
            autoUpdate = show;
            ticksSinceUpdate = 0;
            if (show) {
                update();
                c.show();
            } else {
                c.empty().hide();
            }
            return;
        } else if (event.keyCode == 219) {
            // [
            event.preventDefault();
            ticksToSimulate = max(0, ticksToSimulate - ticksToSimulateAdjust);
            log('Simulating ' + ticksToSimulate + ' ticks');
            if (show) {
                update();
            }
            return;
        } else if (event.keyCode == 221) {
            // ]
            event.preventDefault();
            ticksToSimulate = min(48, ticksToSimulate + ticksToSimulateAdjust);
            log('Simulating ' + ticksToSimulate + ' ticks');
            if (show) {
                update();
            }
            return;
        }
    });

    window.np = window.np || window.NeptunesPride;
    window.u = window.u || window.NeptunesPride.universe;

    return {
        c: c,
        sbn: function sbn() {
            return Object.keys(u.galaxy.stars).reduce(function(o, id) {
                var s = u.galaxy.stars[id];o[s.n] = s;return o;
            }, {});
        },
        fbn: function fbn() {
            return Object.keys(u.galaxy.fleets).reduce(function(o, id) {
                var f = u.galaxy.fleets[id];o[f.n] = f;return o;
            }, {});
        },
        pbn: function pbn() {
            return Object.keys(u.galaxy.players).reduce(function(o, id) {
                var p = u.galaxy.players[id];o[p.n] = p;return o;
            }, {});
        },
        sdt: function sdt(a, b) {
            return getStarDistanceTicks(a, b);
        }
    };
}(window.jQuery, window.console);
