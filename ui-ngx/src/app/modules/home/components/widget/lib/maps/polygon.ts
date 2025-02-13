///
/// Copyright © 2016-2022 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import L, { LatLngExpression, LeafletMouseEvent } from 'leaflet';
import { createTooltip, isCutPolygon } from './maps-utils';
import {
  fillPattern,
  functionValueCalculator,
  parseWithTranslation,
  processPattern,
  safeExecute
} from './common-maps-utils';
import { FormattedData, PolygonSettings, UnitedMapSettings } from './map-models';

export class Polygon {

    private editing = false;

    leafletPoly: L.Polygon;
    tooltip: L.Popup;
    data: FormattedData;
    dataSources: FormattedData[];

    constructor(public map, data: FormattedData, dataSources: FormattedData[], private settings: UnitedMapSettings,
                private onDragendListener?) {
        this.dataSources = dataSources;
        this.data = data;
        const polygonColor = this.getPolygonColor(settings);
        const polygonStrokeColor = this.getPolygonStrokeColor(settings);
        const polyData = data[this.settings.polygonKeyName];
        const polyConstructor = isCutPolygon(polyData) || polyData.length > 2 ? L.polygon : L.rectangle;
        this.leafletPoly = polyConstructor(polyData, {
          fill: true,
          fillColor: polygonColor,
          color: polygonStrokeColor,
          weight: settings.polygonStrokeWeight,
          fillOpacity: settings.polygonOpacity,
          opacity: settings.polygonStrokeOpacity,
          pmIgnore: !settings.editablePolygon,
          snapIgnore: !settings.snappable
        }).addTo(this.map);

        this.updateLabel(settings);

        if (settings.showPolygonTooltip) {
            this.tooltip = createTooltip(this.leafletPoly, settings, data.$datasource);
            this.updateTooltip(data);
        }
        this.createEventListeners();
    }

    private createEventListeners() {
      if (this.settings.editablePolygon && this.onDragendListener) {
        this.leafletPoly.on('pm:markerdragstart', () => this.editing = true);
        this.leafletPoly.on('pm:markerdragend', () => this.editing = false);
        this.leafletPoly.on('pm:edit', (e) => this.onDragendListener(e, this.data));
      }

      if (this.settings.polygonClick) {
        this.leafletPoly.on('click', (event: LeafletMouseEvent) => {
          for (const action in this.settings.polygonClick) {
            if (typeof (this.settings.polygonClick[action]) === 'function') {
              this.settings.polygonClick[action](event.originalEvent, this.data.$datasource);
            }
          }
        });
      }
    }

    updateTooltip(data: FormattedData) {
        const pattern = this.settings.usePolygonTooltipFunction ?
            safeExecute(this.settings.polygonTooltipFunction, [this.data, this.dataSources, this.data.dsIndex]) :
            this.settings.polygonTooltipPattern;
        this.tooltip.setContent(parseWithTranslation.parseTemplate(pattern, data, true));
    }

    updateLabel(settings: PolygonSettings) {
        this.leafletPoly.unbindTooltip();
        if (settings.showPolygonLabel) {
            if (!this.map.polygonLabelText || settings.usePolygonLabelFunction) {
                const pattern = settings.usePolygonLabelFunction ?
                  safeExecute(settings.polygonLabelFunction, [this.data, this.dataSources, this.data.dsIndex]) : settings.polygonLabel;
                this.map.polygonLabelText = parseWithTranslation.prepareProcessPattern(pattern, true);
                this.map.replaceInfoLabelPolygon = processPattern(this.map.polygonLabelText, this.data);
            }
            settings.polygonLabelText = fillPattern(this.map.polygonLabelText, this.map.replaceInfoLabelPolygon, this.data);
            this.leafletPoly.bindTooltip(`<div style="color: ${settings.polygonLabelColor};"><b>${settings.polygonLabelText}</b></div>`,
              { className: 'tb-polygon-label', permanent: true, sticky: true, direction: 'center' })
              .openTooltip(this.leafletPoly.getBounds().getCenter());
        }
    }

    updatePolygon(data: FormattedData, dataSources: FormattedData[], settings: PolygonSettings) {
      if (this.editing) {
        return;
      }
      this.data = data;
      this.dataSources = dataSources;
      const polyData = data[this.settings.polygonKeyName];
      if (isCutPolygon(polyData) || polyData.length > 2) {
        if (this.leafletPoly instanceof L.Rectangle) {
          this.map.removeLayer(this.leafletPoly);
          const polygonColor = this.getPolygonColor(settings);
          const polygonStrokeColor = this.getPolygonStrokeColor(settings);
          this.leafletPoly = L.polygon(polyData, {
            fill: true,
            fillColor: polygonColor,
            color: polygonStrokeColor,
            weight: settings.polygonStrokeWeight,
            fillOpacity: settings.polygonOpacity,
            opacity: settings.polygonStrokeOpacity,
            pmIgnore: !settings.editablePolygon
          }).addTo(this.map);
        } else {
          this.leafletPoly.setLatLngs(polyData);
        }
      } else if (polyData.length === 2) {
        const bounds = new L.LatLngBounds(polyData);
        // @ts-ignore
        this.leafletPoly.setBounds(bounds);
      }
      if (settings.showPolygonTooltip) {
        this.updateTooltip(this.data);
      }
      if (settings.showPolygonLabel) {
        this.updateLabel(settings);
      }
      this.updatePolygonColor(settings);
    }

    removePolygon() {
        this.map.removeLayer(this.leafletPoly);
    }

    updatePolygonColor(settings: PolygonSettings) {
        const polygonColor = this.getPolygonColor(settings);
        const polygonStrokeColor = this.getPolygonStrokeColor(settings);
        const style: L.PathOptions = {
            fill: true,
            fillColor: polygonColor,
            color: polygonStrokeColor,
            weight: settings.polygonStrokeWeight,
            fillOpacity: settings.polygonOpacity,
            opacity: settings.polygonStrokeOpacity
        };
        this.leafletPoly.setStyle(style);
    }

    getPolygonLatLngs() {
        return this.leafletPoly.getLatLngs();
    }

    setPolygonLatLngs(latLngs: LatLngExpression[]) {
        this.leafletPoly.setLatLngs(latLngs);
        this.leafletPoly.redraw();
    }

    private getPolygonColor(settings: PolygonSettings): string | null {
      return functionValueCalculator(settings.usePolygonColorFunction, settings.polygonColorFunction,
        [this.data, this.dataSources, this.data.dsIndex], settings.polygonColor);
    }

  private getPolygonStrokeColor(settings: PolygonSettings): string | null {
    return functionValueCalculator(settings.usePolygonStrokeColorFunction, settings.polygonStrokeColorFunction,
      [this.data, this.dataSources, this.data.dsIndex], settings.polygonStrokeColor);
  }
}
