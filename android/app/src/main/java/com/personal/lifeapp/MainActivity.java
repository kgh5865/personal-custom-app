package com.personal.lifeapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LoopbackServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
