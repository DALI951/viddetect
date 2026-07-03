package com.viddetect

object NodeEngine {
    init {
        System.loadLibrary("native-lib")
    }

    external fun startNodeWithArguments(arguments: Array<String>): Int
    external fun setICUData(icuDir: String)
}
