import _ from 'underscore';

import { restRequest } from 'girder/rest';
import View from 'girder/views/View';

import * as loader from 'vega-loader';
import '@grapecity/wijmo.styles/wijmo.css';
import * as wjcCore from '@grapecity/wijmo';
import * as wjcXlsx from '@grapecity/wijmo.xlsx';

import TableWidgetTemplate from '../templates/tableWidget.pug';
import '../stylesheets/tableWidget.styl';

var TableWidget = View.extend({
    events: {
        'click .g-item-table-view-header': 'toggleView',
        'click .g-table-view-page-prev:not(.disabled)': 'previousPage',
        'click .g-table-view-page-next:not(.disabled)': 'nextPage',
        'click #sheetNav': 'handleSheetNavClick',
    },

    initialize: function (settings) {
        this.file = settings.files.at(0);
        this.showData = false;
        this.page = 0;
        this.data = null;
        this.columns = null;
        this.workbook = null;
        this.states = {
            VIEW_COLLAPSED: 0,
            DATA_TOO_LARGE: 1,
            DATA_LOADING: 2,
            DATA_ERROR: 3,
            DATA_READY: 4
        };
        const MAX_FILE_SIZE = 30e6; // 30MB
        this.state = this.states.VIEW_COLLAPSED;
        if (this.file.get('size') > MAX_FILE_SIZE) {
            this.state = this.states.DATA_TOO_LARGE;
        }
        if (this.tableParser(this.file)) {
            this.render();
        }
    },

    tableParser: function (file) {
        if (!file) {
            return null;
        }
        const ext = file.get('exts')[file.get('exts').length - 1];
        if (file.get('mimeType') === 'text/csv' || ext === 'csv') {
            return 'csv';
        }
        if (file.get('mimeType') === 'text/tab-separated-values' || _.contains(['tsv', 'tab'], ext)) {
            return 'tsv';
        }
        // add handling for .xlsx
        if (file.get('mimeType') === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xlsx') {
            return 'xlsx';
        }
        return null;
    },

    updateData: function () {
        // If we already have the data, just render.
        if (this.data) {
            this.state = this.states.DATA_READY;
            this.render();
            return;
        }

        const parser = this.tableParser(this.file);
        if (!parser) {
            this.$('.g-item-table-view').remove();
            return this;
        }
        if (parser === 'xlsx') {
            this.workbook = new wjcXlsx.Workbook();
            restRequest({
                url: 'file/' + this.file.id + '/download',
                xhrFields: {
                    responseType: 'arraybuffer'
                }
            }).done((data) => {
                const app = this;
                this.workbook.loadAsync(data, function (workbook) {
                    console.log('workbook loaded');
                    app.data = workbook;
                    app.state = app.states.DATA_READY;
                    app.render();
                    return workbook;
                });
            });
        } else {
            loader.loader().load(this.file.downloadUrl()).then((data) => {
                data = loader.read(data, {type: parser, parse: 'auto'});
                this.data = data;
                this.columns = _.keys(data[0]);
                this.state = this.states.DATA_READY;
                this.render();
                return data;
            }, (error) => {
                console.error(error);
                this.state = this.states.DATA_ERROR;
                this.render();
                return null;
            });
        }
    },

    toggleView: function () {
        if (this.state === this.states.VIEW_COLLAPSED) {
            this.state = this.states.DATA_LOADING;
            this.render();
            this.updateData();
        } else if (this.state === this.states.DATA_READY) {
            this.state = this.states.VIEW_COLLAPSED;
            this.render();
        }
    },

    previousPage: function () {
        this.page -= 1;
        this.render();
    },

    nextPage: function () {
        this.page += 1;
        this.render();
    },

    render: function () {
        let message = '';
        if (this.state === this.states.DATA_ERROR) {
            message = 'An error occurred while attempting to read and parse the data file';
        } else if (this.state === this.states.DATA_TOO_LARGE) {
            message = 'Data is too large to preview';
        } else if (this.state === this.states.DATA_LOADING) {
            message = 'Loading...';
        }
        console.log(this.workbook !== null ? true : false);
        this.$el.html(TableWidgetTemplate({
            state: this.state,
            states: this.states,
            message: message,
            fileName: this.file.get('name'),
            columns: this.columns,
            rows: this.data,
            page: this.page,
            pageSize: 10,
            workbook: this.workbook !== null ? true : false,
        }));

        if (this.workbook && this.state === this.states.DATA_READY) {
            this.drawSheetNav(this.workbook.activeWorksheet || 0);
            this.drawSheet(this.workbook.activeWorksheet || 0);
        }
        return this;
    },

    drawSheet: function (sheetIndex) {
        let drawRoot = document.getElementById('tableHost');
        drawRoot.textContent = '';
        this.drawWorksheet(this.workbook, sheetIndex, drawRoot, 200, 100);
    },

    drawSheetNav: function (activeIndex) {
        let container = document.querySelector('#sheetNav');
        container.innerHTML = '';
        let navItem = '';
        for (let i = 0; i < this.workbook.sheets.length; i++) {
            let sheet = this.workbook.sheets[i];
            navItem += `<li role="presentation" class="${i === activeIndex ? 'active' : ''}">`;
            navItem += `<a href="#">${sheet.name}</a></li>`;
        }
        container.innerHTML = navItem;
    },

    drawWorksheet: function (workbook, sheetIndex, rootElement, maxRows, maxColumns) {
        if (!workbook || !workbook.sheets || sheetIndex < 0 || workbook.sheets.length == 0) {
            return;
        }
        sheetIndex = Math.min(sheetIndex, workbook.sheets.length - 1);
        if (maxRows == null) {
            maxRows = 200;
        }
        if (maxColumns == null) {
            maxColumns = 100;
        }
        let sheet = workbook.sheets[sheetIndex];
        let tableEl = document.createElement('table');
        let defaultRowHeight = 20;
        let defaultColumnWidth = 64;
        tableEl.border = '1';
        tableEl.style.borderCollapse = 'collapse';
        let maxRowCells = 0;
        for (let r = 0; sheet.rows && r < sheet.rows.length; r++) {    
            if (sheet.rows[r] && sheet.rows[r].cells) {    
                maxRowCells = Math.max(maxRowCells, sheet.rows[r].cells.length);    
            }    
        }    
        //    
        // add columns    
        let columns = sheet.columns || [], invisColCnt = columns.filter(col => col.visible === false).length;    
        //    
        if (sheet.columns) {    
            maxRowCells = Math.min(Math.max(maxRowCells, columns.length), maxColumns);    
            //    
            for (let c = 0; c < maxRowCells; c++) {    
                let col = columns[c];    
                //    
                if (col && !col.visible) {    
                    continue;    
                }    
                //    
                let colEl = document.createElement('col');    
                tableEl.appendChild(colEl);    
                let colWidth = defaultColumnWidth + 'px';    
                if (col) {    
                    this.importStyle(colEl.style, col.style);    
                    if (col.autoWidth) {    
                        colWidth = '';    
                    }    
                    else if (col.width != null) {    
                        colWidth = col.width + 'px';    
                    }    
                }    
                colEl.style.width = colWidth;    
            }    
        }    
        //    
        // generate rows    
        let rowCount = Math.min(maxRows, sheet.rows.length);    
        for (let r = 0; sheet.rows && r < rowCount; r++) {    
            let row = sheet.rows[r], cellsCnt = 0; // including colspan    
            //        
            if (row && !row.visible) {    
                continue;
            }
            //
            let rowEl = document.createElement('tr');
            tableEl.appendChild(rowEl);
            //
            if (row) {
                this.importStyle(rowEl.style, row.style);
                if (row.height != null) {
                    rowEl.style.height = row.height + 'px';
                }
                //
                for (let c = 0; row.cells && c < row.cells.length; c++) {
                    let cell = row.cells[c], cellEl = document.createElement('td'), col = columns[c];
                    //
                    if (col && !col.visible) {
                        continue;
                    }
                    //
                    cellsCnt++;
                    //
                    rowEl.appendChild(cellEl);
                    if (cell) {
                        this.importStyle(cellEl.style, cell.style);
                        let value = cell.value;
                        //
                        if (!(value == null || value !== value)) { // TBD: check for NaN should be eliminated
                            if (wjcCore.isString(value) && value.charAt(0) == "'") {
                                value = value.substr(1);
                            }
                            let netFormat = '';
                            if (cell.style && cell.style.format) {
                                netFormat = wjcXlsx.Workbook.fromXlsxFormat(cell.style.format)[0];
                            }
                            let fmtValue = netFormat ? wjcCore.Globalize.format(value, netFormat) : value;
                            cellEl.innerHTML = wjcCore.escapeHtml(fmtValue);
                        }
                        //
                        if (cell.colSpan && cell.colSpan > 1) {
                            cellEl.colSpan = this.getVisColSpan(columns, c, cell.colSpan);
                            cellsCnt += cellEl.colSpan - 1;
                            c += cell.colSpan - 1;
                        }
                        //
                        if (cell.note) {
                            wjcCore.addClass(cellEl, 'cell-note');
                            cellEl.title = cell.note.text;
                        }
                    }
                }
            }
            //
            // pad with empty cells
            let padCellsCount = maxRowCells - cellsCnt - invisColCnt;
            for (let i = 0; i < padCellsCount; i++) {
                rowEl.appendChild(document.createElement('td'));
            }
            //
            if (!rowEl.style.height) {
                rowEl.style.height = defaultRowHeight + 'px';
            }
        }
        //
        // do it at the end for performance
        rootElement.appendChild(tableEl);
    },

    getVisColSpan: function (columns, startFrom, colSpan) {
        let res = colSpan;
        //
        for (let i = startFrom; i < columns.length && i < startFrom + colSpan; i++) {
            let col = columns[i];
            if (col && !col.visible) {
                res--;
            }
        }
        //
        return res;
    },

    importStyle: function (cssStyle, xlsxStyle) {
        if (!xlsxStyle) {
            return;
        }
        //
        if (xlsxStyle.fill) {
            if (xlsxStyle.fill.color) {
                cssStyle.backgroundColor = xlsxStyle.fill.color;
            }
        }
        //
        if (xlsxStyle.hAlign && xlsxStyle.hAlign != wjcXlsx.HAlign.Fill) {
            cssStyle.textAlign = wjcXlsx.HAlign[xlsxStyle.hAlign].toLowerCase();
        }
        //
        let font = xlsxStyle.font;
        if (font) {
            if (font.family) {
                cssStyle.fontFamily = font.family;
            }
            if (font.bold) {
                cssStyle.fontWeight = 'bold';
            }
            if (font.italic) {
                cssStyle.fontStyle = 'italic';
            }
            if (font.size != null) {
                cssStyle.fontSize = font.size + 'px';
            }
            if (font.underline) {
                cssStyle.textDecoration = 'underline';
            }
            if (font.color) {
                cssStyle.color = font.color;
            }
        }
    },

    handleSheetNavClick: function (e) {
        e.preventDefault();
        let navEle = e.target.parentElement;
        let activeIndex = this.toggleNavActiveStatus(navEle);
        if (activeIndex >= 0) {
            this.drawSheet(activeIndex);
        }
    },

    toggleNavActiveStatus: function (navEle) {
        let activeIndex = -1;
        let navEles = document.querySelectorAll('#sheetNav li');
        for (let i = 0; i < navEles.length; i++) {
            let currentItem = navEles[i];
            wjcCore.removeClass(currentItem, 'active');
            if (currentItem === navEle) {
                wjcCore.addClass(currentItem, 'active');
                activeIndex = i;
            }
        }
        return activeIndex;
    },
});

export default TableWidget;
